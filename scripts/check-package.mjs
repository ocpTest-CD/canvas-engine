import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  symlink,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Verify the actual tarball, not source imports. Node 22 and tar are required.
const temp = await mkdtemp(path.join(tmpdir(), "canvas-package-"));
try {
  const output = execFileSync(
    process.execPath,
    [process.env.npm_execpath, "pack", "--json", "--pack-destination", temp],
    { encoding: "utf8" },
  );
  const pack = JSON.parse(output)[0];
  execFileSync("tar", ["-xzf", path.join(temp, pack.filename), "-C", temp]);
  const root = path.join(temp, "package");
  const pkg = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  for (const entry of Object.values(pkg.exports)) {
    for (const file of typeof entry === "string"
      ? [entry]
      : Object.values(entry))
      await access(path.join(root, file));
  }
  if (
    pack.files.some((f) =>
      /^(src|tests|playground|node_modules)\//.test(f.path),
    )
  )
    throw Error("Unexpected implementation/test files in package");
  await symlink(
    path.resolve("node_modules"),
    path.join(root, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await mkdir(path.join(temp, "node_modules", "@canvas-app"), {
    recursive: true,
  });
  await symlink(
    root,
    path.join(temp, "node_modules", "@canvas-app", "engine"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const entry = path.join(temp, "consumer.mjs");
  await writeFile(
    entry,
    `
    import assert from 'node:assert/strict';
    import { Document, createSceneBridge, validate, pinchCamera } from '@canvas-app/engine/core';
    assert.equal(typeof globalThis.window, 'undefined');
    const doc = new Document();
    doc.load(validate({version:1,nodes:[],edges:[]}));
    const bridge = createSceneBridge({loadScene:s=>doc.load(s),exportScene:()=>doc.snapshot(),applyChanges:c=>doc.apply(c)}, 'consumer');
    assert.equal(bridge.handle({version:1,sessionId:'consumer',requestId:'1',method:'exportScene'}).ok, true);
    assert.equal(typeof pinchCamera, 'function');
    for (const entry of ['', '/web', '/react', '/style.css']) assert.ok(import.meta.resolve('@canvas-app/engine'+entry));
    bridge.dispose();
  `,
  );
  execFileSync(process.execPath, [entry], { stdio: "inherit" });
  console.log(
    `PASS package ${pkg.version}: tarball exports, headless consumer, bridge and packaging allowlist`,
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
