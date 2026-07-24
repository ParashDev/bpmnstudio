/**
 * A lightweight, rule-friendly view over a bpmn-moddle definitions tree.
 * Rules read from this context instead of walking moddle themselves.
 */

export interface RuleContext {
  definitions: any;
  collaboration: any | null;
  /** all processes, including those referenced from participants */
  processes: any[];
  /** every flow node (recursively, incl. subprocess children) with its container */
  nodes: NodeInfo[];
  /** every sequence flow with its container */
  flows: FlowInfo[];
  /** process lookup for a flow node id */
  processOf: Map<string, any>;
  /** raw XML for text-level checks (duplicate ids) */
  xml: string;
}

export interface NodeInfo {
  el: any;
  /** the process or subprocess directly containing the node */
  container: any;
  /** the top-level process the node ultimately belongs to */
  process: any;
}

export interface FlowInfo {
  el: any;
  container: any;
  process: any;
}

const FLOW_NODE_RE =
  /bpmn:(Task|UserTask|ServiceTask|ScriptTask|ManualTask|SendTask|ReceiveTask|BusinessRuleTask|CallActivity|SubProcess|Transaction|AdHocSubProcess|StartEvent|EndEvent|IntermediateThrowEvent|IntermediateCatchEvent|BoundaryEvent|ExclusiveGateway|ParallelGateway|InclusiveGateway|ComplexGateway|EventBasedGateway)$/;

export function isFlowNode(el: any): boolean {
  return FLOW_NODE_RE.test(el.$type ?? "");
}

export function isGateway(el: any): boolean {
  return /Gateway$/.test(el.$type ?? "");
}

export function isActivity(el: any): boolean {
  return /bpmn:(Task|UserTask|ServiceTask|ScriptTask|ManualTask|SendTask|ReceiveTask|BusinessRuleTask|CallActivity|SubProcess|Transaction|AdHocSubProcess)$/.test(
    el.$type ?? "",
  );
}

export function isEventSubProcess(el: any): boolean {
  return el.$type === "bpmn:SubProcess" && el.triggeredByEvent === true;
}

/** Human-readable label: name, else a readable type plus id. */
export function label(el: any): string {
  if (el.name) return `"${el.name}"`;
  const type = (el.$type ?? "element").replace(/^bpmn:/, "");
  const readable = type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return `the unnamed ${readable}${el.id ? ` (${el.id})` : ""}`;
}

export function typeName(el: any): string {
  return (el.$type ?? "").replace(/^bpmn:/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function incoming(el: any): any[] {
  return el.incoming ?? [];
}

export function outgoing(el: any): any[] {
  return el.outgoing ?? [];
}

export function buildContext(definitions: any, xml: string): RuleContext {
  const rootElements: any[] = definitions.rootElements ?? [];
  const collaboration = rootElements.find((r) => r.$type === "bpmn:Collaboration") ?? null;
  const processes = rootElements.filter((r) => r.$type === "bpmn:Process");

  const nodes: NodeInfo[] = [];
  const flows: FlowInfo[] = [];
  const processOf = new Map<string, any>();

  const walk = (container: any, process: any) => {
    for (const el of container.flowElements ?? []) {
      if (el.$type === "bpmn:SequenceFlow") {
        flows.push({ el, container, process });
        continue;
      }
      if (isFlowNode(el)) {
        nodes.push({ el, container, process });
        processOf.set(el.id, process);
        if (/bpmn:(SubProcess|Transaction|AdHocSubProcess)$/.test(el.$type)) {
          walk(el, process);
        }
      }
    }
  };

  for (const p of processes) walk(p, p);

  return { definitions, collaboration, processes, nodes, flows, processOf, xml };
}
