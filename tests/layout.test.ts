import { describe, it, expect } from "vitest";
import { fitMedia, fitText } from "../src/layout/sizing";
import { validate } from "../src/serialization/scene";
import { Document } from "../src/document/model";
describe("content-aware geometry", () => {
  it.each([
    [1920, 1080],
    [1080, 1920],
    [1024, 1024],
    [1536, 1024],
    [120, 4000],
  ])("preserves %s x %s media ratio", (width, height) => {
    const size = fitMedia({ width, height });
    expect(size.width / size.height).toBeCloseTo(width / height, 5);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(400);
  });
  it("rejects unknown dimensions and bounds long text", () => {
    expect(() => fitMedia({ width: 0, height: 1080 })).toThrow();
    expect(() => fitMedia({ width: Infinity, height: 1080 })).toThrow();
    expect(fitText("长文本".repeat(10000)).height).toBe(420);
  });
  it("preserves legacy geometry and undoes explicit adaptation", () => {
    const legacy = {
      id: "a",
      type: "image",
      title: "legacy",
      x: 10,
      y: 20,
      width: 300,
      height: 270,
    };
    const d = new Document();
    d.load({ version: 1, nodes: [legacy], edges: [] });
    expect(d.nodes.get("a")).toEqual(legacy);
    d.apply([
      {
        kind: "put",
        node: {
          ...legacy,
          ...fitMedia({ width: 1920, height: 1080 }),
          sizeMode: "auto",
        },
      },
    ]);
    d.undo();
    expect(d.nodes.get("a")).toEqual(legacy);
    d.redo();
    expect(d.nodes.get("a")!.width / d.nodes.get("a")!.height).toBeCloseTo(
      16 / 9,
    );
    expect(validate(d.snapshot()).nodes[0].sizeMode).toBe("auto");
  });
  it("rejects malformed persisted layout metadata", () => {
    expect(() =>
      validate({
        version: 1,
        nodes: [
          {
            id: "x",
            type: "image",
            title: "x",
            x: 0,
            y: 0,
            width: 320,
            height: 200,
            media: { width: 0, height: 100, mime: "image/png" },
          },
        ],
        edges: [],
      }),
    ).toThrow();
  });
});
