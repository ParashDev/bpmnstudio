/**
 * Structural diff between two BPMN files: added, removed, and changed
 * elements by id. Purely structural — no visual comparison.
 */
import BpmnModdle from "bpmn-moddle";

export interface DiffEntry {
  id: string;
  label: string;
  type: string;
  /** for changed entries, the human-readable list of what changed */
  changes?: string[];
}

export interface DiffResult {
  added: DiffEntry[];
  removed: DiffEntry[];
  changed: DiffEntry[];
  unchangedCount: number;
}

interface Snapshot {
  type: string;
  name: string;
  doc: string;
  source: string;
  target: string;
  extra: string;
}

function collect(definitions: any): Map<string, Snapshot> {
  const map = new Map<string, Snapshot>();

  const snap = (el: any): Snapshot => ({
    type: el.$type ?? "",
    name: el.name ?? "",
    doc: (el.documentation ?? [])
      .map((d: any) => d.text ?? "")
      .join("\n"),
    source: el.sourceRef?.id ?? "",
    target: el.targetRef?.id ?? "",
    extra: [
      el.conditionExpression?.body ?? "",
      el.default?.id ?? "",
      el.attachedToRef?.id ?? "",
      String(el.isExecutable ?? ""),
      (el.eventDefinitions ?? []).map((d: any) => d.$type).join(","),
    ].join("|"),
  });

  const walk = (container: any) => {
    for (const el of container.flowElements ?? []) {
      if (el.id) map.set(el.id, snap(el));
      if (el.flowElements) walk(el);
    }
    for (const laneSet of container.laneSets ?? []) {
      for (const lane of laneSet.lanes ?? []) {
        if (lane.id) map.set(lane.id, snap(lane));
      }
    }
  };

  for (const root of definitions.rootElements ?? []) {
    if (root.$type === "bpmn:Process") {
      if (root.id) map.set(root.id, snap(root));
      walk(root);
    }
    if (root.$type === "bpmn:Collaboration") {
      for (const p of root.participants ?? []) if (p.id) map.set(p.id, snap(p));
      for (const mf of root.messageFlows ?? []) if (mf.id) map.set(mf.id, snap(mf));
    }
  }
  return map;
}

function shortType(t: string): string {
  return t.replace(/^bpmn:/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function entry(id: string, s: Snapshot, changes?: string[]): DiffEntry {
  return { id, label: s.name || id, type: shortType(s.type), changes };
}

export async function diffBpmn(xmlA: string, xmlB: string): Promise<DiffResult> {
  const moddle = new BpmnModdle();
  const [a, b] = await Promise.all([moddle.fromXML(xmlA), moddle.fromXML(xmlB)]);
  const mapA = collect(a.rootElement);
  const mapB = collect(b.rootElement);

  const added: DiffEntry[] = [];
  const removed: DiffEntry[] = [];
  const changed: DiffEntry[] = [];
  let unchangedCount = 0;

  for (const [id, snapB] of mapB) {
    const snapA = mapA.get(id);
    if (!snapA) {
      added.push(entry(id, snapB));
      continue;
    }
    const changes: string[] = [];
    if (snapA.type !== snapB.type) {
      changes.push(`type: ${shortType(snapA.type)} → ${shortType(snapB.type)}`);
    }
    if (snapA.name !== snapB.name) {
      changes.push(`name: "${snapA.name || "(none)"}" → "${snapB.name || "(none)"}"`);
    }
    if (snapA.doc !== snapB.doc) changes.push("documentation changed");
    if (snapA.source !== snapB.source || snapA.target !== snapB.target) {
      changes.push("connection endpoints changed");
    }
    if (snapA.extra !== snapB.extra) changes.push("properties changed");
    if (changes.length) changed.push(entry(id, snapB, changes));
    else unchangedCount++;
  }

  for (const [id, snapA] of mapA) {
    if (!mapB.has(id)) removed.push(entry(id, snapA));
  }

  return { added, removed, changed, unchangedCount };
}
