/**
 * Process templates. Each template is declared as nodes + edges with explicit
 * geometry; buildXml() emits standard BPMN 2.0 XML with DI, and thumbnailSvg()
 * renders a schematic preview from the same geometry, so previews never drift
 * from the real diagram.
 */

type Kind =
  | "start"
  | "startMsg"
  | "startTimer"
  | "end"
  | "endErr"
  | "endTerm"
  | "catchMsg"
  | "catchTimer"
  | "task"
  | "user"
  | "service"
  | "script"
  | "manual"
  | "send"
  | "receive"
  | "rule"
  | "xgw"
  | "pgw"
  | "egw"
  | "boundaryTimer";

interface NodeDef {
  id: string;
  kind: Kind;
  name?: string;
  x: number;
  y: number;
  /** boundary events: id of the host activity */
  attach?: string;
  nonInterrupting?: boolean;
}

interface EdgeDef {
  id?: string;
  from: string;
  to: string;
  name?: string;
  /** condition expression (implies conditional flow) */
  cond?: string;
  /** mark as the default flow of the source gateway/activity */
  isDefault?: boolean;
  /** explicit waypoints override */
  wp?: [number, number][];
}

interface LaneDef {
  id: string;
  name: string;
  y: number;
  h: number;
  nodes: string[];
}

export interface Template {
  id: string;
  name: string;
  tagline: string;
  description: string;
  pool?: { name: string; x: number; y: number; w: number; h: number };
  lanes?: LaneDef[];
  nodes: NodeDef[];
  edges: EdgeDef[];
}

const SIZE: Record<Kind, [number, number]> = {
  start: [36, 36],
  startMsg: [36, 36],
  startTimer: [36, 36],
  end: [36, 36],
  endErr: [36, 36],
  endTerm: [36, 36],
  catchMsg: [36, 36],
  catchTimer: [36, 36],
  boundaryTimer: [36, 36],
  task: [100, 80],
  user: [100, 80],
  service: [100, 80],
  script: [100, 80],
  manual: [100, 80],
  send: [100, 80],
  receive: [100, 80],
  rule: [100, 80],
  xgw: [50, 50],
  pgw: [50, 50],
  egw: [50, 50],
};

const TAG: Record<Kind, string> = {
  start: "startEvent",
  startMsg: "startEvent",
  startTimer: "startEvent",
  end: "endEvent",
  endErr: "endEvent",
  endTerm: "endEvent",
  catchMsg: "intermediateCatchEvent",
  catchTimer: "intermediateCatchEvent",
  boundaryTimer: "boundaryEvent",
  task: "task",
  user: "userTask",
  service: "serviceTask",
  script: "scriptTask",
  manual: "manualTask",
  send: "sendTask",
  receive: "receiveTask",
  rule: "businessRuleTask",
  xgw: "exclusiveGateway",
  pgw: "parallelGateway",
  egw: "eventBasedGateway",
};

const EVENT_DEF: Partial<Record<Kind, string>> = {
  startMsg: "messageEventDefinition",
  startTimer: "timerEventDefinition",
  catchMsg: "messageEventDefinition",
  catchTimer: "timerEventDefinition",
  boundaryTimer: "timerEventDefinition",
  endErr: "errorEventDefinition",
  endTerm: "terminateEventDefinition",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function size(n: NodeDef): [number, number] {
  return SIZE[n.kind];
}

function center(n: NodeDef): [number, number] {
  const [w, h] = size(n);
  return [n.x + w / 2, n.y + h / 2];
}

function autoWaypoints(src: NodeDef, tgt: NodeDef): [number, number][] {
  const [sw] = size(src);
  const [scx, scy] = center(src);
  const [tcx, tcy] = center(tgt);
  const sRight = src.x + sw;
  if (Math.abs(scy - tcy) < 2) {
    return [
      [sRight, scy],
      [tgt.x, tcy],
    ];
  }
  const mx = (sRight + tgt.x) / 2;
  return [
    [sRight, scy],
    [mx, scy],
    [mx, tcy],
    [tgt.x, tcy],
  ];
}

export function buildXml(t: Template): string {
  const nodeById = new Map(t.nodes.map((n) => [n.id, n]));
  const edges = t.edges.map((e, i) => ({ ...e, id: e.id ?? `Flow_${t.id}_${i + 1}` }));
  const defaults = new Map<string, string>();
  for (const e of edges) if (e.isDefault) defaults.set(e.from, e.id!);

  const procId = `Process_${t.id}`;
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="Definitions_${t.id}" targetNamespace="http://bpmn.io/schema/bpmn">`,
  );

  if (t.pool) {
    lines.push(`  <bpmn:collaboration id="Collaboration_${t.id}">`);
    lines.push(
      `    <bpmn:participant id="Participant_${t.id}" name="${esc(t.pool.name)}" processRef="${procId}" />`,
    );
    lines.push(`  </bpmn:collaboration>`);
  }

  lines.push(`  <bpmn:process id="${procId}" isExecutable="false">`);

  if (t.lanes?.length) {
    lines.push(`    <bpmn:laneSet id="LaneSet_${t.id}">`);
    for (const lane of t.lanes) {
      lines.push(`      <bpmn:lane id="${lane.id}" name="${esc(lane.name)}">`);
      for (const ref of lane.nodes) {
        lines.push(`        <bpmn:flowNodeRef>${ref}</bpmn:flowNodeRef>`);
      }
      lines.push(`      </bpmn:lane>`);
    }
    lines.push(`    </bpmn:laneSet>`);
  }

  for (const n of t.nodes) {
    const tag = TAG[n.kind];
    const attrs: string[] = [`id="${n.id}"`];
    if (n.name) attrs.push(`name="${esc(n.name)}"`);
    if (n.kind === "boundaryTimer") {
      attrs.push(`attachedToRef="${n.attach}"`);
      if (n.nonInterrupting) attrs.push(`cancelActivity="false"`);
    }
    const def = defaults.get(n.id);
    if (def) attrs.push(`default="${def}"`);
    const evDef = EVENT_DEF[n.kind];
    if (evDef) {
      lines.push(`    <bpmn:${tag} ${attrs.join(" ")}>`);
      lines.push(`      <bpmn:${evDef} id="${n.id}_def" />`);
      lines.push(`    </bpmn:${tag}>`);
    } else {
      lines.push(`    <bpmn:${tag} ${attrs.join(" ")} />`);
    }
  }

  for (const e of edges) {
    const attrs = [`id="${e.id}"`, `sourceRef="${e.from}"`, `targetRef="${e.to}"`];
    if (e.name) attrs.push(`name="${esc(e.name)}"`);
    if (e.cond) {
      lines.push(`    <bpmn:sequenceFlow ${attrs.join(" ")}>`);
      lines.push(
        `      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${esc(e.cond)}</bpmn:conditionExpression>`,
      );
      lines.push(`    </bpmn:sequenceFlow>`);
    } else {
      lines.push(`    <bpmn:sequenceFlow ${attrs.join(" ")} />`);
    }
  }

  lines.push(`  </bpmn:process>`);

  // --- DI ---
  const planeRef = t.pool ? `Collaboration_${t.id}` : procId;
  lines.push(`  <bpmndi:BPMNDiagram id="BPMNDiagram_${t.id}">`);
  lines.push(`    <bpmndi:BPMNPlane id="BPMNPlane_${t.id}" bpmnElement="${planeRef}">`);

  if (t.pool) {
    const p = t.pool;
    lines.push(
      `      <bpmndi:BPMNShape id="Participant_${t.id}_di" bpmnElement="Participant_${t.id}" isHorizontal="true">`,
    );
    lines.push(`        <dc:Bounds x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" />`);
    lines.push(`      </bpmndi:BPMNShape>`);
    for (const lane of t.lanes ?? []) {
      lines.push(
        `      <bpmndi:BPMNShape id="${lane.id}_di" bpmnElement="${lane.id}" isHorizontal="true">`,
      );
      lines.push(
        `        <dc:Bounds x="${p.x + 30}" y="${lane.y}" width="${p.w - 30}" height="${lane.h}" />`,
      );
      lines.push(`      </bpmndi:BPMNShape>`);
    }
  }

  for (const n of t.nodes) {
    const [w, h] = size(n);
    lines.push(`      <bpmndi:BPMNShape id="${n.id}_di" bpmnElement="${n.id}">`);
    lines.push(`        <dc:Bounds x="${n.x}" y="${n.y}" width="${w}" height="${h}" />`);
    lines.push(`      </bpmndi:BPMNShape>`);
  }

  for (const e of edges) {
    const src = nodeById.get(e.from)!;
    const tgt = nodeById.get(e.to)!;
    const wp = e.wp ?? autoWaypoints(src, tgt);
    lines.push(`      <bpmndi:BPMNEdge id="${e.id}_di" bpmnElement="${e.id}">`);
    for (const [x, y] of wp) {
      lines.push(`        <di:waypoint x="${x}" y="${y}" />`);
    }
    lines.push(`      </bpmndi:BPMNEdge>`);
  }

  lines.push(`    </bpmndi:BPMNPlane>`);
  lines.push(`  </bpmndi:BPMNDiagram>`);
  lines.push(`</bpmn:definitions>`);
  return lines.join("\n") + "\n";
}

/**
 * Schematic SVG preview drawn from the template's real geometry.
 * Optionally draws an editor-style selection box (accent color, corner
 * handles) around one node — used by the landing-page mockup.
 */
export function thumbnailSvg(t: Template, highlightId?: string): string {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (x: number, y: number, w = 0, h = 0) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  };
  if (t.pool) include(t.pool.x, t.pool.y, t.pool.w, t.pool.h);
  for (const n of t.nodes) include(n.x, n.y, ...size(n));
  const pad = 24;
  const vb = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;

  const parts: string[] = [];
  const nodeById = new Map(t.nodes.map((n) => [n.id, n]));

  if (t.pool) {
    const p = t.pool;
    parts.push(
      `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="4" fill="none" stroke="currentColor" stroke-opacity="0.35" stroke-width="3"/>`,
    );
    for (const lane of t.lanes ?? []) {
      parts.push(
        `<line x1="${p.x + 30}" y1="${lane.y}" x2="${p.x + p.w}" y2="${lane.y}" stroke="currentColor" stroke-opacity="0.25" stroke-width="2"/>`,
      );
    }
  }

  for (const e of t.edges) {
    const src = nodeById.get(e.from)!;
    const tgt = nodeById.get(e.to)!;
    const wp = e.wp ?? autoWaypoints(src, tgt);
    const pts = wp.map(([x, y]) => `${x},${y}`).join(" ");
    parts.push(
      `<polyline points="${pts}" fill="none" stroke="currentColor" stroke-opacity="0.45" stroke-width="2.5"/>`,
    );
  }

  for (const n of t.nodes) {
    const [w, h] = size(n);
    const [cx, cy] = center(n);
    if (
      n.kind.startsWith("start") ||
      n.kind.startsWith("end") ||
      n.kind === "catchMsg" ||
      n.kind === "catchTimer" ||
      n.kind === "boundaryTimer"
    ) {
      const isEnd = n.kind.startsWith("end");
      parts.push(
        `<circle cx="${cx}" cy="${cy}" r="${w / 2}" fill="none" stroke="currentColor" stroke-width="${isEnd ? 5 : 2.5}"/>`,
      );
    } else if (n.kind.endsWith("gw")) {
      parts.push(
        `<path d="M ${cx} ${n.y} L ${n.x + w} ${cy} L ${cx} ${n.y + h} L ${n.x} ${cy} Z" fill="none" stroke="currentColor" stroke-width="2.5"/>`,
      );
    } else {
      parts.push(
        `<rect x="${n.x}" y="${n.y}" width="${w}" height="${h}" rx="10" fill="none" stroke="currentColor" stroke-width="2.5"/>`,
      );
    }
  }

  if (highlightId) {
    const n = nodeById.get(highlightId);
    if (n) {
      const [w, h] = size(n);
      const m = 7;
      const x = n.x - m;
      const y = n.y - m;
      const bw = w + m * 2;
      const bh = h + m * 2;
      parts.push(
        `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="4" fill="none" stroke="var(--accent, #0d9488)" stroke-width="1.5" stroke-dasharray="5 4"/>`,
      );
      for (const [hx, hy] of [
        [x, y],
        [x + bw, y],
        [x, y + bh],
        [x + bw, y + bh],
      ]) {
        parts.push(
          `<rect x="${hx - 3.5}" y="${hy - 3.5}" width="7" height="7" fill="var(--surface, #fff)" stroke="var(--accent, #0d9488)" stroke-width="1.5"/>`,
        );
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-hidden="true">${parts.join("")}</svg>`;
}

/* ------------------------------------------------------------------ */
/* The templates                                                       */
/* ------------------------------------------------------------------ */

export const templates: Template[] = [
  {
    id: "approval",
    name: "Approval chain",
    tagline: "Two-stage sign-off with rejection path",
    description:
      "A request passes through manager and director review in sequence. Each exclusive gateway routes an approved request onward and a rejected one to a single notification step, so the rejection path is defined once. This is the backbone of most internal request processes: purchase approvals, access requests, content sign-off.",
    nodes: [
      { id: "ap_start", kind: "start", name: "Request submitted", x: 156, y: 162 },
      { id: "ap_submit", kind: "user", name: "Complete request form", x: 240, y: 140 },
      { id: "ap_mgr", kind: "user", name: "Manager review", x: 390, y: 140 },
      { id: "ap_gw1", kind: "xgw", name: "Manager decision", x: 540, y: 155 },
      { id: "ap_dir", kind: "user", name: "Director review", x: 640, y: 140 },
      { id: "ap_gw2", kind: "xgw", name: "Director decision", x: 790, y: 155 },
      { id: "ap_notify", kind: "send", name: "Notify requester of approval", x: 890, y: 140 },
      { id: "ap_end_ok", kind: "end", name: "Approved", x: 1040, y: 162 },
      { id: "ap_reject", kind: "send", name: "Send rejection with reason", x: 640, y: 300 },
      { id: "ap_end_no", kind: "end", name: "Rejected", x: 800, y: 322 },
    ],
    edges: [
      { from: "ap_start", to: "ap_submit" },
      { from: "ap_submit", to: "ap_mgr" },
      { from: "ap_mgr", to: "ap_gw1" },
      { from: "ap_gw1", to: "ap_dir", name: "Approved", cond: "approved == true" },
      {
        from: "ap_gw1",
        to: "ap_reject",
        name: "Rejected",
        isDefault: true,
        wp: [
          [565, 205],
          [565, 340],
          [640, 340],
        ],
      },
      { from: "ap_gw2", to: "ap_notify", name: "Approved", cond: "approved == true" },
      {
        from: "ap_gw2",
        to: "ap_reject",
        name: "Rejected",
        isDefault: true,
        wp: [
          [815, 205],
          [815, 260],
          [690, 260],
          [690, 300],
        ],
      },
      { from: "ap_notify", to: "ap_end_ok" },
      { from: "ap_reject", to: "ap_end_no" },
    ],
  },
  {
    id: "escalation",
    name: "Exception handling with escalation timer",
    tagline: "Boundary timer escalates stalled work",
    description:
      "A ticket is worked normally, but an interrupting timer on the handling task fires if it sits too long, pulling the work to a supervisor and notifying the customer. Boundary timers are the standard BPMN answer to SLA breaches — the escalation path is explicit in the model instead of living in someone's head.",
    nodes: [
      { id: "es_start", kind: "start", name: "Ticket received", x: 156, y: 162 },
      { id: "es_handle", kind: "user", name: "Handle ticket", x: 250, y: 140 },
      { id: "es_close", kind: "task", name: "Close ticket", x: 410, y: 140 },
      { id: "es_end", kind: "end", name: "Resolved", x: 570, y: 162 },
      { id: "es_timer", kind: "boundaryTimer", name: "48 h without resolution", x: 282, y: 202, attach: "es_handle" },
      { id: "es_sup", kind: "user", name: "Supervisor takes over", x: 410, y: 290 },
      { id: "es_notify", kind: "send", name: "Notify customer of delay", x: 570, y: 290 },
      { id: "es_end2", kind: "end", name: "Escalated", x: 730, y: 312 },
    ],
    edges: [
      { from: "es_start", to: "es_handle" },
      { from: "es_handle", to: "es_close" },
      { from: "es_close", to: "es_end" },
      {
        from: "es_timer",
        to: "es_sup",
        wp: [
          [300, 238],
          [300, 330],
          [410, 330],
        ],
      },
      { from: "es_sup", to: "es_notify" },
      { from: "es_notify", to: "es_end2" },
    ],
  },
  {
    id: "foureyes",
    name: "Four-eyes review",
    tagline: "Parallel review, both must approve",
    description:
      "Two reviewers work in parallel between a parallel split and join, then an exclusive gateway checks that both approved. If either rejected, the document goes back for rework and through review again. The parallel gateway pair is the point: neither reviewer waits on the other, and the join guarantees both finished before the decision.",
    nodes: [
      { id: "fe_start", kind: "start", name: "Document ready", x: 156, y: 252 },
      { id: "fe_prep", kind: "user", name: "Prepare document", x: 240, y: 230 },
      { id: "fe_split", kind: "pgw", x: 390, y: 245 },
      { id: "fe_ra", kind: "user", name: "Reviewer A checks", x: 490, y: 130 },
      { id: "fe_rb", kind: "user", name: "Reviewer B checks", x: 490, y: 340 },
      { id: "fe_join", kind: "pgw", x: 640, y: 245 },
      { id: "fe_gw", kind: "xgw", name: "Both approved?", x: 740, y: 245 },
      { id: "fe_pub", kind: "service", name: "Publish document", x: 840, y: 230 },
      { id: "fe_end", kind: "end", name: "Published", x: 990, y: 252 },
      { id: "fe_rework", kind: "user", name: "Rework document", x: 715, y: 380 },
    ],
    edges: [
      { from: "fe_start", to: "fe_prep" },
      { from: "fe_prep", to: "fe_split" },
      {
        from: "fe_split",
        to: "fe_ra",
        wp: [
          [415, 245],
          [415, 170],
          [490, 170],
        ],
      },
      {
        from: "fe_split",
        to: "fe_rb",
        wp: [
          [415, 295],
          [415, 380],
          [490, 380],
        ],
      },
      {
        from: "fe_ra",
        to: "fe_join",
        wp: [
          [590, 170],
          [665, 170],
          [665, 245],
        ],
      },
      {
        from: "fe_rb",
        to: "fe_join",
        wp: [
          [590, 380],
          [665, 380],
          [665, 295],
        ],
      },
      { from: "fe_join", to: "fe_gw" },
      { from: "fe_gw", to: "fe_pub", name: "Yes", cond: "approvals == 2" },
      {
        from: "fe_gw",
        to: "fe_rework",
        name: "No",
        isDefault: true,
        wp: [
          [765, 295],
          [765, 380],
        ],
      },
      {
        from: "fe_rework",
        to: "fe_prep",
        wp: [
          [715, 420],
          [290, 420],
          [290, 310],
        ],
      },
    ],
  },
  {
    id: "kyc",
    name: "Onboarding / KYC",
    tagline: "Two lanes: applicant and compliance",
    description:
      "A customer application flows across two lanes in one pool. The applicant submits documents; compliance verifies identity, runs a risk check, and either opens the account or rejects with a reason. Lanes make the handoffs visible — every crossing of the lane boundary is a handoff between roles, which is exactly where onboarding processes stall in practice.",
    pool: { name: "Customer onboarding", x: 120, y: 80, w: 980, h: 480 },
    lanes: [
      { id: "kyc_lane_app", name: "Applicant", y: 80, h: 220, nodes: ["kyc_start", "kyc_docs", "kyc_end_ok"] },
      {
        id: "kyc_lane_comp",
        name: "Compliance",
        y: 300,
        h: 260,
        nodes: ["kyc_verify", "kyc_risk", "kyc_gw", "kyc_open", "kyc_reject", "kyc_end_no"],
      },
    ],
    nodes: [
      { id: "kyc_start", kind: "startMsg", name: "Application received", x: 216, y: 172 },
      { id: "kyc_docs", kind: "user", name: "Submit identity documents", x: 300, y: 150 },
      { id: "kyc_verify", kind: "service", name: "Verify identity", x: 300, y: 370 },
      { id: "kyc_risk", kind: "rule", name: "Run risk assessment", x: 460, y: 370 },
      { id: "kyc_gw", kind: "xgw", name: "High risk?", x: 620, y: 385 },
      { id: "kyc_open", kind: "user", name: "Open account", x: 730, y: 350 },
      { id: "kyc_reject", kind: "send", name: "Send rejection with reason", x: 730, y: 460 },
      { id: "kyc_end_ok", kind: "end", name: "Account opened", x: 930, y: 172 },
      { id: "kyc_end_no", kind: "end", name: "Application rejected", x: 930, y: 482 },
    ],
    edges: [
      { from: "kyc_start", to: "kyc_docs" },
      {
        from: "kyc_docs",
        to: "kyc_verify",
        wp: [
          [350, 230],
          [350, 370],
        ],
      },
      { from: "kyc_verify", to: "kyc_risk" },
      { from: "kyc_risk", to: "kyc_gw" },
      {
        from: "kyc_gw",
        to: "kyc_open",
        name: "No",
        isDefault: true,
        wp: [
          [670, 410],
          [700, 410],
          [700, 390],
          [730, 390],
        ],
      },
      {
        from: "kyc_gw",
        to: "kyc_reject",
        name: "Yes",
        cond: "riskLevel == \"high\"",
        wp: [
          [645, 435],
          [645, 500],
          [730, 500],
        ],
      },
      {
        from: "kyc_open",
        to: "kyc_end_ok",
        wp: [
          [830, 390],
          [880, 390],
          [880, 190],
          [930, 190],
        ],
      },
      { from: "kyc_reject", to: "kyc_end_no" },
    ],
  },
  {
    id: "claims",
    name: "Claims intake",
    tagline: "Completeness loop before assessment",
    description:
      "A submitted claim is validated for completeness. Incomplete claims trigger a request for missing information and the process waits on a message catch event until the claimant responds, then validates again. Complete claims proceed to damage assessment, payout calculation, and approval. The wait-and-loop is the pattern to copy: the process is explicit about being blocked on the customer.",
    nodes: [
      { id: "cl_start", kind: "startMsg", name: "Claim submitted", x: 156, y: 182 },
      { id: "cl_reg", kind: "task", name: "Register claim", x: 240, y: 160 },
      { id: "cl_val", kind: "service", name: "Validate claim", x: 390, y: 160 },
      { id: "cl_gw", kind: "xgw", name: "Complete?", x: 540, y: 175 },
      { id: "cl_assess", kind: "user", name: "Assess damage", x: 650, y: 160 },
      { id: "cl_calc", kind: "rule", name: "Calculate payout", x: 800, y: 160 },
      { id: "cl_approve", kind: "user", name: "Approve payout", x: 950, y: 160 },
      { id: "cl_end", kind: "end", name: "Claim paid", x: 1100, y: 182 },
      { id: "cl_req", kind: "send", name: "Request missing information", x: 515, y: 300 },
      { id: "cl_wait", kind: "catchMsg", name: "Information received", x: 390, y: 322 },
    ],
    edges: [
      { from: "cl_start", to: "cl_reg" },
      { from: "cl_reg", to: "cl_val" },
      { from: "cl_val", to: "cl_gw" },
      { from: "cl_gw", to: "cl_assess", name: "Yes", cond: "complete == true" },
      {
        from: "cl_gw",
        to: "cl_req",
        name: "No",
        isDefault: true,
        wp: [
          [565, 225],
          [565, 300],
        ],
      },
      {
        from: "cl_req",
        to: "cl_wait",
        wp: [
          [515, 340],
          [426, 340],
        ],
      },
      {
        from: "cl_wait",
        to: "cl_val",
        wp: [
          [408, 322],
          [408, 240],
        ],
      },
      { from: "cl_assess", to: "cl_calc" },
      { from: "cl_calc", to: "cl_approve" },
      { from: "cl_approve", to: "cl_end" },
    ],
  },
  {
    id: "incident",
    name: "Incident escalation",
    tagline: "Severity routing with timed escalation",
    description:
      "Triage routes critical incidents to immediate resolution with an interrupting one-hour timer — if the fix stalls, a manager takes over. Minor incidents are logged and scheduled. This shape (severity gateway plus boundary timer on the critical path) is the core of most on-call runbooks, made executable.",
    nodes: [
      { id: "in_start", kind: "start", name: "Incident reported", x: 156, y: 182 },
      { id: "in_triage", kind: "user", name: "Triage incident", x: 240, y: 160 },
      { id: "in_gw", kind: "xgw", name: "Severity?", x: 390, y: 175 },
      { id: "in_resolve", kind: "user", name: "Resolve incident", x: 500, y: 80 },
      { id: "in_post", kind: "task", name: "Write post-mortem", x: 660, y: 80 },
      { id: "in_end1", kind: "end", name: "Resolved", x: 820, y: 102 },
      { id: "in_timer", kind: "boundaryTimer", name: "1 h without fix", x: 532, y: 142, attach: "in_resolve" },
      { id: "in_mgr", kind: "user", name: "Manager takes over", x: 660, y: 220 },
      { id: "in_end2", kind: "end", name: "Escalated", x: 820, y: 242 },
      { id: "in_log", kind: "task", name: "Log and schedule fix", x: 500, y: 330 },
      { id: "in_end3", kind: "end", name: "Scheduled", x: 660, y: 352 },
    ],
    edges: [
      { from: "in_start", to: "in_triage" },
      { from: "in_triage", to: "in_gw" },
      {
        from: "in_gw",
        to: "in_resolve",
        name: "Critical",
        cond: "severity == \"critical\"",
        wp: [
          [415, 175],
          [415, 120],
          [500, 120],
        ],
      },
      { from: "in_resolve", to: "in_post" },
      { from: "in_post", to: "in_end1" },
      {
        from: "in_timer",
        to: "in_mgr",
        wp: [
          [550, 178],
          [550, 260],
          [660, 260],
        ],
      },
      { from: "in_mgr", to: "in_end2" },
      {
        from: "in_gw",
        to: "in_log",
        name: "Minor",
        isDefault: true,
        wp: [
          [415, 225],
          [415, 370],
          [500, 370],
        ],
      },
      { from: "in_log", to: "in_end3" },
    ],
  },
  {
    id: "p2p",
    name: "Procure-to-pay",
    tagline: "Requisition to payment with 3-way match",
    description:
      "The full purchasing cycle: requisition, approval, purchase order, goods receipt, then a wait for the supplier invoice. A gateway performs the three-way match between order, receipt, and invoice; discrepancies are resolved before payment. Modeling the invoice as a message catch event is deliberate — the process genuinely waits on an external party.",
    nodes: [
      { id: "pp_start", kind: "start", name: "Need identified", x: 156, y: 182 },
      { id: "pp_req", kind: "user", name: "Create purchase requisition", x: 240, y: 160 },
      { id: "pp_appr", kind: "user", name: "Approve requisition", x: 390, y: 160 },
      { id: "pp_gw1", kind: "xgw", name: "Approved?", x: 540, y: 175 },
      { id: "pp_po", kind: "service", name: "Create purchase order", x: 640, y: 160 },
      { id: "pp_recv", kind: "user", name: "Receive goods", x: 790, y: 160 },
      { id: "pp_inv", kind: "catchMsg", name: "Invoice received", x: 940, y: 182 },
      { id: "pp_gw2", kind: "xgw", name: "3-way match?", x: 1030, y: 175 },
      { id: "pp_pay", kind: "service", name: "Pay invoice", x: 1130, y: 160 },
      { id: "pp_end", kind: "end", name: "Paid", x: 1280, y: 182 },
      { id: "pp_end_no", kind: "end", name: "Rejected", x: 547, y: 292 },
      { id: "pp_fix", kind: "user", name: "Resolve discrepancy", x: 980, y: 300 },
    ],
    edges: [
      { from: "pp_start", to: "pp_req" },
      { from: "pp_req", to: "pp_appr" },
      { from: "pp_appr", to: "pp_gw1" },
      { from: "pp_gw1", to: "pp_po", name: "Yes", cond: "approved == true" },
      {
        from: "pp_gw1",
        to: "pp_end_no",
        name: "No",
        isDefault: true,
        wp: [
          [565, 225],
          [565, 292],
        ],
      },
      { from: "pp_po", to: "pp_recv" },
      { from: "pp_recv", to: "pp_inv" },
      { from: "pp_inv", to: "pp_gw2" },
      { from: "pp_gw2", to: "pp_pay", name: "Match", cond: "matched == true" },
      {
        from: "pp_gw2",
        to: "pp_fix",
        name: "Mismatch",
        isDefault: true,
        wp: [
          [1055, 225],
          [1055, 300],
        ],
      },
      {
        from: "pp_fix",
        to: "pp_pay",
        wp: [
          [1080, 340],
          [1180, 340],
          [1180, 240],
        ],
      },
    ],
  },
  {
    id: "fulfillment",
    name: "Order fulfillment",
    tagline: "Parallel picking and invoicing, backorder loop",
    description:
      "An order is checked against stock. In-stock orders fan out into parallel picking and invoicing before shipping; out-of-stock orders trigger a backorder and the process waits on the supplier before checking stock again. Combines the two patterns most fulfillment processes need: parallel work and an external-wait loop.",
    nodes: [
      { id: "of_start", kind: "startMsg", name: "Order received", x: 156, y: 182 },
      { id: "of_check", kind: "service", name: "Check stock", x: 240, y: 160 },
      { id: "of_gw", kind: "xgw", name: "In stock?", x: 390, y: 175 },
      { id: "of_split", kind: "pgw", x: 480, y: 175 },
      { id: "of_pick", kind: "manual", name: "Pick and pack items", x: 570, y: 80 },
      { id: "of_inv", kind: "service", name: "Generate invoice", x: 570, y: 240 },
      { id: "of_join", kind: "pgw", x: 720, y: 175 },
      { id: "of_ship", kind: "task", name: "Ship order", x: 810, y: 160 },
      { id: "of_end", kind: "end", name: "Shipped", x: 960, y: 182 },
      { id: "of_back", kind: "send", name: "Backorder from supplier", x: 365, y: 300 },
      { id: "of_wait", kind: "catchMsg", name: "Stock received", x: 520, y: 322 },
    ],
    edges: [
      { from: "of_start", to: "of_check" },
      { from: "of_check", to: "of_gw" },
      { from: "of_gw", to: "of_split", name: "Yes", cond: "inStock == true" },
      { from: "of_split", to: "of_pick", wp: [[505, 175], [505, 120], [570, 120]] },
      { from: "of_split", to: "of_inv", wp: [[505, 225], [505, 280], [570, 280]] },
      { from: "of_pick", to: "of_join", wp: [[670, 120], [745, 120], [745, 175]] },
      { from: "of_inv", to: "of_join", wp: [[670, 280], [745, 280], [745, 225]] },
      { from: "of_join", to: "of_ship" },
      { from: "of_ship", to: "of_end" },
      { from: "of_gw", to: "of_back", name: "No", isDefault: true, wp: [[415, 225], [415, 340], [465, 340]] },
      { from: "of_back", to: "of_wait" },
      { from: "of_wait", to: "of_check", wp: [[538, 322], [538, 262], [290, 262], [290, 240]] },
    ],
  },
  {
    id: "refund",
    name: "Refund with response deadline",
    tagline: "Event-based gateway: reply or timeout",
    description:
      "A refund request is reviewed; approved requests are paid out directly. For borderline cases the company offers store credit instead — and then an event-based gateway waits for whichever happens first: the customer accepts the credit, or seven days pass with no reply and the case closes. The event-based gateway is the precise BPMN construct for \"first of these events wins\", which ordinary gateways cannot express.",
    nodes: [
      { id: "rf_start", kind: "startMsg", name: "Refund requested", x: 156, y: 182 },
      { id: "rf_review", kind: "user", name: "Review request", x: 240, y: 160 },
      { id: "rf_gw", kind: "xgw", name: "Decision?", x: 390, y: 175 },
      { id: "rf_pay", kind: "service", name: "Issue refund", x: 490, y: 160 },
      { id: "rf_notify", kind: "send", name: "Notify customer", x: 640, y: 160 },
      { id: "rf_end1", kind: "end", name: "Refunded", x: 790, y: 182 },
      { id: "rf_offer", kind: "send", name: "Offer store credit", x: 465, y: 300 },
      { id: "rf_egw", kind: "egw", x: 615, y: 315 },
      { id: "rf_acc", kind: "catchMsg", name: "Credit accepted", x: 715, y: 272 },
      { id: "rf_timeout", kind: "catchTimer", name: "No reply in 7 days", x: 715, y: 372 },
      { id: "rf_apply", kind: "service", name: "Apply store credit", x: 800, y: 250 },
      { id: "rf_end2", kind: "end", name: "Credited", x: 950, y: 272 },
      { id: "rf_close", kind: "task", name: "Close as expired", x: 800, y: 350 },
      { id: "rf_end3", kind: "end", name: "Expired", x: 950, y: 372 },
    ],
    edges: [
      { from: "rf_start", to: "rf_review" },
      { from: "rf_review", to: "rf_gw" },
      { from: "rf_gw", to: "rf_pay", name: "Full refund", cond: "decision == \"refund\"" },
      { from: "rf_pay", to: "rf_notify" },
      { from: "rf_notify", to: "rf_end1" },
      { from: "rf_gw", to: "rf_offer", name: "Offer credit", isDefault: true, wp: [[415, 225], [415, 340], [465, 340]] },
      { from: "rf_offer", to: "rf_egw" },
      { from: "rf_egw", to: "rf_acc", wp: [[640, 315], [640, 290], [715, 290]] },
      { from: "rf_egw", to: "rf_timeout", wp: [[640, 365], [640, 390], [715, 390]] },
      { from: "rf_acc", to: "rf_apply" },
      { from: "rf_apply", to: "rf_end2" },
      { from: "rf_timeout", to: "rf_close" },
      { from: "rf_close", to: "rf_end3" },
    ],
  },
];

export function templateById(id: string): Template | undefined {
  return templates.find((t) => t.id === id);
}
