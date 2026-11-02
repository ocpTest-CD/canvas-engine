import { uid, type Node, type Snapshot, type Change } from "../core/types";
import type { Document } from "./model";
interface CommandHost {
  document: Document;
  selected: Set<string>;
  applyChanges(changes: Change[]): void;
  notify(): void;
  showNodePanel(id?: string, reveal?: boolean): void;
}
/** Reusable scene commands. Clipboard and grouping never depend on a renderer. */
export class NodeCommands {
  private clipboard?: { nodes: Node[]; edges: Snapshot["edges"] };
  constructor(
    private host: CommandHost,
    private cloned: (mapping: Map<string, string>) => void,
  ) {}
  copy() {
    const nodes = [...this.host.selected]
      .map((id) => this.host.document.nodes.get(id)!)
      .filter(Boolean);
    this.clipboard = {
      nodes: structuredClone(nodes),
      edges: [...this.host.document.edges.values()].filter(
        (e) => this.host.selected.has(e.from) && this.host.selected.has(e.to),
      ),
    };
  }
  paste() {
    if (!this.clipboard) return;
    const ids = new Map(this.clipboard.nodes.map((n) => [n.id, uid()]));
    const groups = new Map<string, string>();
    const nodes = this.clipboard.nodes.map((n) => {
      if (n.group && !groups.has(n.group)) groups.set(n.group, uid());
      return {
        ...n,
        id: ids.get(n.id)!,
        x: n.x + 30,
        y: n.y + 30,
        ...(n.group ? { group: groups.get(n.group) } : {}),
      };
    });
    this.host.applyChanges([
      ...nodes.map((node) => ({ kind: "put" as const, node })),
      ...this.clipboard.edges.map((e) => ({
        kind: "connect" as const,
        edge: { id: uid(), from: ids.get(e.from)!, to: ids.get(e.to)! },
      })),
    ]);
    this.host.selected = new Set(nodes.map((n) => n.id));
    this.cloned(ids);
    if (nodes.length === 1) this.host.showNodePanel(nodes[0].id, true);
    this.clipboard.nodes = nodes;
    this.clipboard.edges = this.clipboard.edges.map((e) => ({
      ...e,
      from: ids.get(e.from)!,
      to: ids.get(e.to)!,
    }));
    this.host.notify();
  }
  duplicate() {
    this.copy();
    this.paste();
  }
  group() {
    const group = uid();
    this.host.applyChanges(
      [...this.host.selected].map((id) => ({
        kind: "put",
        node: { ...this.host.document.nodes.get(id)!, group },
      })),
    );
  }
  ungroup() {
    const groups = new Set(
      [...this.host.selected]
        .map((id) => this.host.document.nodes.get(id)?.group)
        .filter(Boolean),
    );
    this.host.applyChanges(
      [...this.host.document.nodes.values()]
        .filter((n) => n.group && groups.has(n.group))
        .map((n) => {
          const node = { ...n };
          delete node.group;
          return { kind: "put", node };
        }),
    );
  }
  reorder(front: boolean) {
    const nodes = [...this.host.document.nodes.values()],
      selected = nodes.filter((n) => this.host.selected.has(n.id)),
      others = nodes.filter((n) => !this.host.selected.has(n.id));
    this.host.document.reorder(
      (front ? [...others, ...selected] : [...selected, ...others]).map(
        (n) => n.id,
      ),
    );
  }
}
