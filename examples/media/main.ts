import { createExample } from "../common";
import type { Node } from "../../src";
const { engine, blobs, ready } = await createExample(
  "媒体画布 · 横图 / 竖图 / 方图 / 视频",
);
const nodes: Node[] = [];
for (const [i, [width, height, color]] of [
  [1200, 800, "#e7bb64"],
  [800, 1200, "#a3c9b2"],
  [1000, 1000, "#b8aed6"],
].entries()) {
  const canvas = document.createElement("canvas");
  canvas.width = Number(width);
  canvas.height = Number(height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = String(color);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#30362d";
  ctx.font = "64px system-ui";
  ctx.fillText(`${width} × ${height}`, 60, 100);
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/png"),
  );
  const id = `media-${i}`;
  blobs.set(id, blob);
  nodes.push({
    id,
    type: "image",
    title: `比例 ${width}:${height}`,
    assetId: id,
    x: 100 + i * 450,
    y: 100,
    width: 320,
    height: 220,
    sizeMode: "auto",
  });
}
const response = await fetch(
  new URL("../../tests/fixtures/sample.webm", import.meta.url),
);
blobs.set("video", await response.blob());
nodes.push({
  id: "video",
  type: "video",
  title: "视频封面 / 点击播放",
  assetId: "video",
  x: 100,
  y: 600,
  width: 320,
  height: 220,
  sizeMode: "auto",
});
engine.loadScene({
  version: 1,
  nodes,
  edges: [],
  camera: { x: 0, y: 0, zoom: 0.75 },
});

ready();
