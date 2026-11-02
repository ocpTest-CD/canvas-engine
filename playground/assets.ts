import type { Snapshot } from "../src";
export interface Project {
  scene: Snapshot;
  assets: Array<[string, Blob]>;
}
export class AssetStore {
  blobs = new Map<string, Blob>();
  add(blob: Blob, id = crypto.randomUUID()) {
    this.blobs.set(id, blob);
    return id;
  }
  resolve = async (id: string) => {
    const blob = this.blobs.get(id);
    if (!blob) throw Error("素材丢失");
    const url = URL.createObjectURL(blob);
    return { url, mime: blob.type, release: () => URL.revokeObjectURL(url) };
  };
  async save(scene: Snapshot) {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put(
        { scene, assets: [...this.blobs] } satisfies Project,
        "current",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }
  async load() {
    const db = await open();
    const result = await new Promise<Project | undefined>((resolve, reject) => {
      const r = db
        .transaction("projects")
        .objectStore("projects")
        .get("current");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return result;
  }
  async export(scene: Snapshot) {
    const needed = new Set(scene.nodes.map((n) => n.assetId).filter(Boolean));
    const assets = await Promise.all(
      [...this.blobs]
        .filter(([id]) => needed.has(id))
        .map(async ([id, blob]) => ({
          id,
          mime: blob.type,
          data: await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.onerror = reject;
            r.readAsDataURL(blob);
          }),
        })),
    );
    return new Blob(
      [JSON.stringify({ format: "canvas-project", version: 1, scene, assets })],
      { type: "application/json" },
    );
  }
  async parse(file: File) {
    if (file.size > 150 * 1024 * 1024) throw Error("项目文件超过 150 MB");
    const raw = JSON.parse(await file.text());
    if (
      raw.format !== "canvas-project" ||
      raw.version !== 1 ||
      !Array.isArray(raw.assets)
    )
      throw Error("不支持的项目格式");
    const blobs = new Map<string, Blob>();
    for (const a of raw.assets) {
      if (
        typeof a.id !== "string" ||
        blobs.has(a.id) ||
        typeof a.data !== "string" ||
        !/^data:(image\/(png|jpeg|webp|gif)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+);base64,/i.test(
          a.data,
        )
      )
        throw Error("不支持的素材编码");
      const blob = await fetch(a.data).then((r) => r.blob());
      blobs.set(a.id, blob);
    }
    return { scene: raw.scene, blobs };
  }
}
function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("canvas-engine-lab", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("projects");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function sampleImage() {
  const c = document.createElement("canvas");
  c.width = 900;
  c.height = 650;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ded8b7";
  g.fillRect(0, 0, 900, 650);
  g.fillStyle = "#d39552";
  g.beginPath();
  g.arc(690, 160, 80, 0, 7);
  g.fill();
  g.fillStyle = "#798f78";
  g.beginPath();
  g.moveTo(0, 430);
  g.bezierCurveTo(260, 90, 490, 660, 900, 250);
  g.lineTo(900, 650);
  g.lineTo(0, 650);
  g.fill();
  g.fillStyle = "#425f54";
  g.beginPath();
  g.moveTo(0, 540);
  g.bezierCurveTo(400, 360, 650, 620, 900, 400);
  g.lineTo(900, 650);
  g.lineTo(0, 650);
  g.fill();
  g.fillStyle = "#fff8df";
  g.font = "32px sans-serif";
  g.fillText("A little room to imagine.", 60, 100);
  return new Promise<Blob>((resolve) =>
    c.toBlob((b) => resolve(b!), "image/png"),
  );
}
