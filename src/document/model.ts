import type { Node, Edge, Change, Snapshot } from "../core/types";
import { validate } from "../serialization/scene";
export * from "../core/types";
export { validate } from "../serialization/scene";
interface Patch {
  nodes: Map<string, Node | undefined>;
  edges: Map<string, Edge | undefined>;
  order?: string[];
}
interface Transaction {
  before: Patch;
  after: Patch;
}
export class Document {
  nodes = new Map<string, Node>();
  edges = new Map<string, Edge>();
  revision = 0;
  private past: Transaction[] = [];
  private future: Transaction[] = [];
  onChange: (ids: Set<string>) => void = () => {};
  load(raw: unknown) {
    const s = validate(raw);
    this.nodes = new Map(s.nodes.map((n) => [n.id, n]));
    this.edges = new Map(s.edges.map((e) => [e.id, e]));
    this.past = [];
    this.future = [];
    this.revision++;
    this.onChange(new Set(this.nodes.keys()));
    return s;
  }
  snapshot(): Snapshot {
    return structuredClone({
      version: 1,
      nodes: [...this.nodes.values()],
      edges: [...this.edges.values()],
    });
  }
  apply(changes: Change[], history = true) {
    if (!changes.length) return;
    const ns = new Map(this.nodes),
      es = new Map(this.edges);
    const touchedN = new Set<string>(),
      touchedE = new Set<string>();
    for (const c of changes) {
      if (c.kind === "put") {
        ns.set(c.node.id, structuredClone(c.node));
        touchedN.add(c.node.id);
      }
      if (c.kind === "remove") {
        ns.delete(c.id);
        touchedN.add(c.id);
        for (const [id, e] of es)
          if (e.from === c.id || e.to === c.id) {
            es.delete(id);
            touchedE.add(id);
          }
      }
      if (c.kind === "connect") {
        es.set(c.edge.id, { ...c.edge });
        touchedE.add(c.edge.id);
      }
      if (c.kind === "disconnect") {
        es.delete(c.id);
        touchedE.add(c.id);
      }
    }
    validate({ version: 1, nodes: [...ns.values()], edges: [...es.values()] });
    const patch = (
      nodes: Map<string, Node>,
      edges: Map<string, Edge>,
    ): Patch => ({
      nodes: new Map([...touchedN].map((id) => [id, nodes.get(id)])),
      edges: new Map([...touchedE].map((id) => [id, edges.get(id)])),
      ...([...touchedN].some((id) => this.nodes.has(id) !== ns.has(id))
        ? { order: [...nodes.keys()] }
        : {}),
    });
    if (history) {
      this.past.push({
        before: patch(this.nodes, this.edges),
        after: patch(ns, es),
      });
      if (this.past.length > 100) this.past.shift();
      this.future = [];
    }
    this.nodes = ns;
    this.edges = es;
    this.revision++;
    this.onChange(touchedN);
  }
  // Volatile status stays outside user history, including when geometry is undone.
  updateStatus(id: string, status: string) {
    const n = this.nodes.get(id);
    if (!n) return;
    this.nodes.set(id, { ...n, status });
    this.revision++;
    this.onChange(new Set([id]));
  }
  reorder(ids: string[]) {
    if (
      ids.length !== this.nodes.size ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !this.nodes.has(id))
    )
      throw Error("无效层级顺序");
    const currentOrder = [...this.nodes.keys()];
    if (ids.every((id, i) => id === currentOrder[i])) return;
    const before = {
      nodes: new Map(),
      edges: new Map(),
      order: [...this.nodes.keys()],
    };
    const after = { nodes: new Map(), edges: new Map(), order: ids };
    this.past.push({ before, after });
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    this.restore(after);
  }
  private restore(p: Patch) {
    for (const [id, n] of p.nodes) {
      if (n) {
        const status = this.nodes.get(id)?.status;
        this.nodes.set(id, {
          ...n,
          ...(status !== undefined ? { status } : {}),
        });
      } else this.nodes.delete(id);
    }
    for (const [id, e] of p.edges) {
      if (e && this.nodes.has(e.from) && this.nodes.has(e.to))
        this.edges.set(id, e);
      else this.edges.delete(id);
    }
    for (const [id, e] of this.edges)
      if (!this.nodes.has(e.from) || !this.nodes.has(e.to))
        this.edges.delete(id);
    if (p.order)
      this.nodes = new Map(
        [
          ...p.order.filter((id) => this.nodes.has(id)),
          ...[...this.nodes.keys()].filter((id) => !p.order!.includes(id)),
        ].map((id) => [id, this.nodes.get(id)!]),
      );
    this.revision++;
    this.onChange(new Set(p.nodes.keys()));
  }
  undo() {
    const t = this.past.pop();
    if (t) {
      this.restore(t.before);
      this.future.push(t);
    }
  }
  redo() {
    const t = this.future.pop();
    if (t) {
      this.restore(t.after);
      this.past.push(t);
    }
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
}
