import type { Node, Edge, Change, Snapshot } from "../core/types";
import { validate, validateNode, validateEdge } from "../serialization/scene";
export * from "../core/types";
export { validate } from "../serialization/scene";
interface Patch {
  nodes: Map<string, Node | undefined>;
  edges: Map<string, Edge | undefined>;
  order?: string[];
  edgeOrder?: string[];
}
interface Transaction {
  before: Patch;
  after: Patch;
}
export interface DocumentOptions {
  canConnect?: (edge: Edge, from: Node, to: Node) => boolean;
}
export interface DocumentChange {
  edges: Set<string>;
  geometry: Set<string>;
  orderChanged: boolean;
  reset?: boolean;
}
const sameGeometry = (a?: Node, b?: Node) =>
  !!a &&
  !!b &&
  a.x === b.x &&
  a.y === b.y &&
  a.width === b.width &&
  a.height === b.height;
/** Exposed Maps are read-only by convention. Write through transactions. */
export class Document {
  constructor(private options: DocumentOptions = {}) {}
  nodes = new Map<string, Node>();
  edges = new Map<string, Edge>();
  revision = 0;
  private adjacency = new Map<string, Set<string>>();
  private past: Transaction[] = [];
  private future: Transaction[] = [];
  onChange: (ids: Set<string>, detail: DocumentChange) => void = () => {};
  incidentEdges(id: string): ReadonlySet<string> {
    return new Set(this.adjacency.get(id));
  }
  private link(edge: Edge) {
    for (const id of [edge.from, edge.to]) {
      if (!this.adjacency.has(id)) this.adjacency.set(id, new Set());
      this.adjacency.get(id)!.add(edge.id);
    }
  }
  private unlink(edge: Edge) {
    for (const id of [edge.from, edge.to]) {
      const edges = this.adjacency.get(id);
      edges?.delete(edge.id);
      if (!edges?.size) this.adjacency.delete(id);
    }
  }
  load(raw: unknown) {
    const s = validate(raw);
    const nodes = new Map(s.nodes.map((n) => [n.id, n]));
    for (const edge of s.edges)
      if (
        this.options.canConnect?.(
          edge,
          nodes.get(edge.from)!,
          nodes.get(edge.to)!,
        ) === false
      )
        throw Error("连线不符合宿主规则");
    this.nodes = nodes;
    this.edges = new Map(s.edges.map((e) => [e.id, e]));
    this.adjacency.clear();
    for (const edge of this.edges.values()) this.link(edge);
    this.past = [];
    this.future = [];
    this.revision++;
    this.onChange(new Set(this.nodes.keys()), {
      edges: new Set(this.edges.keys()),
      geometry: new Set(this.nodes.keys()),
      orderChanged: true,
      reset: true,
    });
    return structuredClone(s);
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
    const ns = new Map<string, Node | undefined>(),
      es = new Map<string, Edge | undefined>();
    let order: Set<string> | undefined;
    let edgeOrder: Set<string> | undefined;
    const getNode = (id: string) =>
      ns.has(id) ? ns.get(id) : this.nodes.get(id);
    const getEdge = (id: string) =>
      es.has(id) ? es.get(id) : this.edges.get(id);
    const getOrder = () => (order ??= new Set(this.nodes.keys()));
    const getEdgeOrder = () => (edgeOrder ??= new Set(this.edges.keys()));
    for (const c of changes) {
      if (!c || typeof c !== "object") throw Error("无效变更");
      if (c.kind === "put") {
        if (!c.node || typeof c.node.id !== "string") throw Error("无效节点");
        if (!getNode(c.node.id)) getOrder().add(c.node.id);
        ns.set(c.node.id, structuredClone(c.node));
      } else if (c.kind === "remove") {
        if (getNode(c.id)) getOrder().delete(c.id);
        ns.set(c.id, undefined);
        const affected = new Set(this.adjacency.get(c.id));
        for (const [id, edge] of es)
          if (edge && (edge.from === c.id || edge.to === c.id))
            affected.add(id);
        for (const id of affected) {
          const edge = getEdge(id);
          if (edge && (edge.from === c.id || edge.to === c.id)) {
            es.set(id, undefined);
            getEdgeOrder().delete(id);
          }
        }
      } else if (c.kind === "connect") {
        if (!c.edge || typeof c.edge.id !== "string") throw Error("无效连线");
        if (!getEdge(c.edge.id)) getEdgeOrder().add(c.edge.id);
        es.set(c.edge.id, structuredClone(c.edge));
      } else if (c.kind === "disconnect") {
        if (getEdge(c.id)) getEdgeOrder().delete(c.id);
        es.set(c.id, undefined);
      } else throw Error("不支持的变更");
    }
    // Validate the staged result before changing any live entry.
    for (const n of ns.values()) if (n) validateNode(n);
    for (const e of es.values()) if (e) validateEdge(e, (id) => !!getNode(id));
    if (this.options.canConnect) {
      const affected = new Set(es.keys());
      for (const id of ns.keys())
        for (const edge of this.incidentEdges(id)) affected.add(edge);
      for (const id of affected) {
        const edge = getEdge(id);
        if (
          edge &&
          this.options.canConnect(
            edge,
            getNode(edge.from)!,
            getNode(edge.to)!,
          ) === false
        )
          throw Error("连线不符合宿主规则");
      }
    }
    const finalSize = <T>(
      base: Map<string, T>,
      patch: Map<string, T | undefined>,
    ) => {
      let size = base.size;
      for (const [id, value] of patch)
        size += Number(value !== undefined) - Number(base.has(id));
      return size;
    };
    if (finalSize(this.nodes, ns) > 50000 || finalSize(this.edges, es) > 100000)
      throw Error("不支持的场景规模");
    const before: Patch = {
      nodes: new Map([...ns.keys()].map((id) => [id, this.nodes.get(id)])),
      edges: new Map([...es.keys()].map((id) => [id, this.edges.get(id)])),
      ...(order ? { order: [...this.nodes.keys()] } : {}),
      ...(edgeOrder ? { edgeOrder: [...this.edges.keys()] } : {}),
    };
    const after: Patch = {
      nodes: ns,
      edges: es,
      ...(order ? { order: [...order] } : {}),
      ...(edgeOrder ? { edgeOrder: [...edgeOrder] } : {}),
    };
    if (history) {
      this.past.push({ before, after });
      if (this.past.length > 100) this.past.shift();
      this.future = [];
    } else if (order || es.size) {
      this.past = [];
      this.future = [];
    }
    this.commit(after, false);
  }
  updateStatus(id: string, status: string) {
    if (typeof status !== "string") throw Error("无效状态");
    const n = this.nodes.get(id);
    if (!n) return;
    this.nodes.set(id, { ...n, status });
    this.revision++;
    this.onChange(new Set([id]), {
      edges: new Set(),
      geometry: new Set(),
      orderChanged: false,
    });
  }
  reorder(ids: string[]) {
    if (
      ids.length !== this.nodes.size ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !this.nodes.has(id))
    )
      throw Error("无效层级顺序");
    const current = [...this.nodes.keys()];
    if (ids.every((id, i) => id === current[i])) return;
    const before: Patch = {
      nodes: new Map(),
      edges: new Map(),
      order: current,
    };
    const after: Patch = {
      nodes: new Map(),
      edges: new Map(),
      order: [...ids],
    };
    this.past.push({ before, after });
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    this.commit(after, true);
  }
  private commit(p: Patch, preserveStatus: boolean) {
    const geometry = new Set<string>();
    for (const [id, n] of p.nodes) {
      const old = this.nodes.get(id);
      if (!sameGeometry(old, n)) geometry.add(id);
      if (n)
        this.nodes.set(
          id,
          preserveStatus && old?.status !== undefined
            ? { ...n, status: old.status }
            : n,
        );
      else this.nodes.delete(id);
    }
    for (const [id, e] of p.edges) {
      const old = this.edges.get(id);
      if (old) this.unlink(old);
      if (e && this.nodes.has(e.from) && this.nodes.has(e.to)) {
        this.edges.set(id, e);
        this.link(e);
      } else this.edges.delete(id);
    }
    if (p.edgeOrder)
      this.edges = new Map(
        p.edgeOrder
          .filter((id) => this.edges.has(id))
          .map((id) => [id, this.edges.get(id)!]),
      );
    if (p.order) {
      const seen = new Set(p.order);
      this.nodes = new Map(
        [
          ...p.order.filter((id) => this.nodes.has(id)),
          ...[...this.nodes.keys()].filter((id) => !seen.has(id)),
        ].map((id) => [id, this.nodes.get(id)!]),
      );
    }
    this.revision++;
    this.onChange(new Set(p.nodes.keys()), {
      edges: new Set(p.edges.keys()),
      geometry,
      orderChanged: !!p.order,
    });
  }
  undo() {
    const t = this.past.pop();
    if (t) {
      this.commit(t.before, true);
      this.future.push(t);
    }
  }
  redo() {
    const t = this.future.pop();
    if (t) {
      this.commit(t.after, true);
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
