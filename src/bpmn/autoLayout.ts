/**
 * Auto-layout for BPMN files with no DI section (typical of engine exports).
 * Produces a left-to-right layered layout: columns by longest-path depth,
 * rows within a column. Approximate by design — the goal is a readable
 * starting point, not typography-grade routing.
 */
import BpmnModdle from "bpmn-moddle";

export function hasDiSection(xml: string): boolean {
  return /<\s*(\w+:)?BPMNDiagram[\s>]/.test(xml);
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const COL_W = 180;
const ROW_H = 130;
const MARGIN_X = 180;
const MARGIN_Y = 80;
const POOL_GAP = 60;

function sizeOf(el: any): [number, number] {
  const t: string = el.$type;
  if (/Event$/.test(t)) return [36, 36];
  if (/Gateway$/.test(t)) return [50, 50];
  if (t === "bpmn:TextAnnotation") return [100, 30];
  if (t === "bpmn:DataObjectReference" || t === "bpmn:DataStoreReference") return [50, 50];
  return [100, 80];
}

function isFlowNode(el: any): boolean {
  return /bpmn:(Task|UserTask|ServiceTask|ScriptTask|ManualTask|SendTask|ReceiveTask|BusinessRuleTask|CallActivity|SubProcess|Transaction|AdHocSubProcess|StartEvent|EndEvent|IntermediateThrowEvent|IntermediateCatchEvent|BoundaryEvent|ExclusiveGateway|ParallelGateway|InclusiveGateway|ComplexGateway|EventBasedGateway)$/.test(
    el.$type,
  );
}

/** Layout one process's flow nodes; returns per-element boxes and total extent. */
function layoutProcess(process: any, originY: number): { boxes: Map<string, Box>; height: number } {
  const nodes: any[] = (process.flowElements ?? []).filter(
    (el: any) => isFlowNode(el) && el.$type !== "bpmn:BoundaryEvent",
  );
  const boundaries: any[] = (process.flowElements ?? []).filter(
    (el: any) => el.$type === "bpmn:BoundaryEvent",
  );
  const flows: any[] = (process.flowElements ?? []).filter(
    (el: any) => el.$type === "bpmn:SequenceFlow",
  );

  const boxes = new Map<string, Box>();
  if (!nodes.length) return { boxes, height: ROW_H };

  const out = new Map<string, string[]>();
  const inc = new Map<string, number>();
  for (const n of nodes) {
    out.set(n.id, []);
    inc.set(n.id, 0);
  }
  for (const f of flows) {
    const s = f.sourceRef?.id;
    const t = f.targetRef?.id;
    if (s && t && out.has(s) && inc.has(t)) {
      out.get(s)!.push(t);
      inc.set(t, inc.get(t)! + 1);
    }
  }

  // Longest-path layering via BFS from sources, with a visit cap for cycles.
  const layer = new Map<string, number>();
  const sources = nodes.filter((n) => (inc.get(n.id) ?? 0) === 0);
  const queue: [string, number][] = (sources.length ? sources : nodes.slice(0, 1)).map((n) => [
    n.id,
    0,
  ]);
  const visits = new Map<string, number>();
  while (queue.length) {
    const [id, depth] = queue.shift()!;
    const seen = visits.get(id) ?? 0;
    if (seen > 2) continue;
    visits.set(id, seen + 1);
    if ((layer.get(id) ?? -1) >= depth && seen > 0) continue;
    layer.set(id, Math.max(layer.get(id) ?? 0, depth));
    for (const next of out.get(id) ?? []) queue.push([next, depth + 1]);
  }
  for (const n of nodes) if (!layer.has(n.id)) layer.set(n.id, 0);

  // Rows within each column.
  const columns = new Map<number, any[]>();
  for (const n of nodes) {
    const l = layer.get(n.id)!;
    if (!columns.has(l)) columns.set(l, []);
    columns.get(l)!.push(n);
  }

  let maxRows = 1;
  for (const [l, colNodes] of columns) {
    maxRows = Math.max(maxRows, colNodes.length);
    colNodes.forEach((n, row) => {
      const [w, h] = sizeOf(n);
      const cx = MARGIN_X + l * COL_W + 50;
      const cy = originY + MARGIN_Y + row * ROW_H + 40;
      boxes.set(n.id, { x: cx - w / 2, y: cy - h / 2, w, h });
    });
  }

  // Boundary events sit on the bottom edge of their host.
  for (const b of boundaries) {
    const host = b.attachedToRef?.id ? boxes.get(b.attachedToRef.id) : undefined;
    if (host) {
      boxes.set(b.id, { x: host.x + host.w - 30, y: host.y + host.h - 18, w: 36, h: 36 });
    } else {
      boxes.set(b.id, { x: MARGIN_X, y: originY + MARGIN_Y, w: 36, h: 36 });
    }
  }

  return { boxes, height: MARGIN_Y + maxRows * ROW_H + 40 };
}

/**
 * Parse XML lacking DI, generate a layered layout, and return XML with a
 * complete bpmndi section. Throws if the file has no processes at all.
 */
export async function autoLayoutXml(xml: string): Promise<string> {
  const moddle = new BpmnModdle();
  const { rootElement: definitions } = await moddle.fromXML(xml);

  const rootElements: any[] = definitions.rootElements ?? [];
  const collaboration = rootElements.find((r) => r.$type === "bpmn:Collaboration");
  const processes = rootElements.filter((r) => r.$type === "bpmn:Process");
  if (!processes.length) {
    throw new Error("The file contains no process to lay out.");
  }

  const planeElements: any[] = [];
  const allBoxes = new Map<string, Box>();

  const make = (type: string, attrs: Record<string, unknown>) => moddle.create(type as any, attrs);

  let cursorY = 0;
  const participants: any[] = collaboration?.participants ?? [];

  const orderedProcesses = participants.length
    ? participants.map((p) => p.processRef).filter(Boolean)
    : processes;

  orderedProcesses.forEach((process: any, idx: number) => {
    const { boxes, height } = layoutProcess(process, cursorY);
    for (const [id, box] of boxes) allBoxes.set(id, box);

    const participant = participants.find((p) => p.processRef === process);
    if (participant) {
      let maxX = MARGIN_X + 400;
      for (const box of boxes.values()) maxX = Math.max(maxX, box.x + box.w);
      const shape = make("bpmndi:BPMNShape", {
        id: `${participant.id}_di`,
        bpmnElement: participant,
        isHorizontal: true,
        bounds: make("dc:Bounds", {
          x: MARGIN_X - 80,
          y: cursorY + 20,
          width: maxX - MARGIN_X + 180,
          height: height + 20,
        }),
      });
      planeElements.push(shape);
    }

    for (const el of process.flowElements ?? []) {
      const box = allBoxes.get(el.id);
      if (!box || el.$type === "bpmn:SequenceFlow") continue;
      const attrs: Record<string, unknown> = {
        id: `${el.id}_di`,
        bpmnElement: el,
        bounds: make("dc:Bounds", { x: box.x, y: box.y, width: box.w, height: box.h }),
      };
      if (/bpmn:(SubProcess|Transaction|AdHocSubProcess)/.test(el.$type)) {
        // Collapsed: children without DI stay hidden rather than misplaced.
        attrs.isExpanded = false;
      }
      planeElements.push(make("bpmndi:BPMNShape", attrs));
    }

    for (const el of process.flowElements ?? []) {
      if (el.$type !== "bpmn:SequenceFlow") continue;
      const s = allBoxes.get(el.sourceRef?.id);
      const t = allBoxes.get(el.targetRef?.id);
      if (!s || !t) continue;
      const scy = s.y + s.h / 2;
      const tcy = t.y + t.h / 2;
      const points =
        Math.abs(scy - tcy) < 2
          ? [
              [s.x + s.w, scy],
              [t.x, tcy],
            ]
          : [
              [s.x + s.w, scy],
              [(s.x + s.w + t.x) / 2, scy],
              [(s.x + s.w + t.x) / 2, tcy],
              [t.x, tcy],
            ];
      planeElements.push(
        make("bpmndi:BPMNEdge", {
          id: `${el.id}_di`,
          bpmnElement: el,
          waypoint: points.map(([x, y]) => make("dc:Point", { x, y })),
        }),
      );
    }

    cursorY += height + (participant ? 60 : 0) + POOL_GAP;
    void idx;
  });

  // Message flows between pools.
  for (const mf of collaboration?.messageFlows ?? []) {
    const s = allBoxes.get(mf.sourceRef?.id);
    const t = allBoxes.get(mf.targetRef?.id);
    if (!s || !t) continue;
    planeElements.push(
      make("bpmndi:BPMNEdge", {
        id: `${mf.id}_di`,
        bpmnElement: mf,
        waypoint: [
          make("dc:Point", { x: s.x + s.w / 2, y: s.y + s.h }),
          make("dc:Point", { x: t.x + t.w / 2, y: t.y }),
        ],
      }),
    );
  }

  const plane = make("bpmndi:BPMNPlane", {
    id: "BPMNPlane_auto",
    bpmnElement: collaboration ?? orderedProcesses[0],
    planeElement: planeElements,
  });
  const diagram = make("bpmndi:BPMNDiagram", { id: "BPMNDiagram_auto", plane });
  definitions.diagrams = [diagram];

  const { xml: outXml } = await moddle.toXML(definitions, { format: true });
  return outXml!;
}
