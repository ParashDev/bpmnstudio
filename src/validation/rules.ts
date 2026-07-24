/**
 * The rule set. Each rule receives the shared context and a report callback.
 * To add a rule: append an object with a stable id and a run() that calls
 * report() with a severity, a plain-language message (problem + consequence),
 * and the offending element. Register nothing else — the engine runs every
 * rule in this array.
 */
import {
  RuleContext,
  incoming,
  isActivity,
  isEventSubProcess,
  isGateway,
  label,
  outgoing,
} from "./model";
import type { Finding, Severity } from "./types";

export interface Rule {
  id: string;
  run(ctx: RuleContext, report: Report): void;
}

export type Report = (severity: Severity, message: string, el?: any) => void;

/* ------------------------------------------------------------------ */

const connectivity: Rule = {
  id: "connectivity",
  run(ctx, report) {
    for (const { el } of ctx.nodes) {
      const t = el.$type;
      const hasIn = incoming(el).length > 0;
      const hasOut = outgoing(el).length > 0;
      const isStart = t === "bpmn:StartEvent";
      const isEnd = t === "bpmn:EndEvent";
      const isBoundary = t === "bpmn:BoundaryEvent";

      if (!hasIn && !hasOut && !isBoundary && !isEventSubProcess(el)) {
        report(
          "error",
          `${cap(label(el))} is not connected to anything, so it can never take part in the process.`,
          el,
        );
        continue;
      }
      if (isStart && !hasOut) {
        report(
          "error",
          `${cap(label(el))} has no outgoing flow, so the process starts and immediately goes nowhere.`,
          el,
        );
      }
      if (isEnd && !hasIn) {
        report(
          "warning",
          `${cap(label(el))} has no incoming flow, so this end can never be reached.`,
          el,
        );
      }
      if (!isStart && !isBoundary && !isEventSubProcess(el) && hasOut && !hasIn) {
        report(
          "warning",
          `${cap(label(el))} has no incoming flow — nothing ever leads to it, so it will never execute.`,
          el,
        );
      }
      if (!isEnd && !isTerminateLike(el) && hasIn && !hasOut && t !== "bpmn:IntermediateThrowEvent") {
        report(
          "warning",
          `${cap(label(el))} has no outgoing flow — the process silently stops here instead of ending explicitly.`,
          el,
        );
      }
    }
  },
};

function isTerminateLike(el: any): boolean {
  return (el.eventDefinitions ?? []).some((d: any) => d.$type === "bpmn:TerminateEventDefinition");
}

const startEndPresence: Rule = {
  id: "start-end-presence",
  run(ctx, report) {
    for (const process of ctx.processes) {
      const nodes = ctx.nodes.filter((n) => n.process === process && n.container === process);
      if (!nodes.length) continue;
      const starts = nodes.filter((n) => n.el.$type === "bpmn:StartEvent");
      const ends = nodes.filter((n) => n.el.$type === "bpmn:EndEvent");
      if (!starts.length) {
        report(
          "warning",
          `${processLabel(ctx, process)} has no start event, so readers cannot tell where it begins.`,
        );
      }
      if (!ends.length) {
        report(
          "warning",
          `${processLabel(ctx, process)} has no end event, so readers cannot tell when it is finished.`,
        );
      }
      const plainStarts = starts.filter((n) => !(n.el.eventDefinitions ?? []).length);
      if (plainStarts.length > 1) {
        for (const n of plainStarts) {
          report(
            "warning",
            `${processLabel(ctx, process)} has ${plainStarts.length} untyped start events. Multiple starts are only meaningful when each reacts to a different trigger — otherwise it is ambiguous where the process begins.`,
            n.el,
          );
        }
      }
    }
  },
};

const pointlessGateway: Rule = {
  id: "pointless-gateway",
  run(ctx, report) {
    for (const { el } of ctx.nodes) {
      if (!isGateway(el)) continue;
      if (incoming(el).length <= 1 && outgoing(el).length <= 1) {
        report(
          "hint",
          `${cap(label(el))} neither splits nor joins anything — it can be removed without changing the process.`,
          el,
        );
      }
    }
  },
};

const exclusiveConditions: Rule = {
  id: "exclusive-gateway-conditions",
  run(ctx, report) {
    for (const { el } of ctx.nodes) {
      if (el.$type !== "bpmn:ExclusiveGateway") continue;
      const outs = outgoing(el);
      if (outs.length < 2) continue;
      const defaultFlow = el.default;
      const unconditioned = outs.filter((f: any) => f !== defaultFlow && !f.conditionExpression);
      if (unconditioned.length > 0 && !defaultFlow) {
        report(
          "error",
          `${cap(label(el))} splits into ${outs.length} paths, but ${
            unconditioned.length === outs.length ? "none of them have" : "some paths have no"
          } a condition and no default path is marked. At runtime there is no way to decide which path to take — this is the most common real-world BPMN defect.`,
          el,
        );
      } else if (unconditioned.length > 1) {
        for (const f of unconditioned) {
          report(
            "warning",
            `The path ${label(f)} out of ${label(el)} has no condition and is not the default, so it is unclear when it would be taken.`,
            f,
          );
        }
      }
    }
  },
};

const splitJoin: Rule = {
  id: "parallel-split-join",
  run(ctx, report) {
    for (const process of ctx.processes) {
      const nodes = ctx.nodes.filter((n) => n.process === process);
      const splits = nodes.filter(
        (n) => n.el.$type === "bpmn:ParallelGateway" && outgoing(n.el).length > 1,
      );
      const joins = nodes.filter(
        (n) => n.el.$type === "bpmn:ParallelGateway" && incoming(n.el).length > 1,
      );
      if (splits.length > joins.length) {
        for (const s of splits.slice(joins.length)) {
          report(
            "warning",
            `${cap(label(s.el))} starts ${outgoing(s.el).length} parallel branches, but the process has no matching parallel join. The branches never synchronize, which usually means duplicated or racing work downstream.`,
            s.el,
          );
        }
      }
    }
  },
};

const parallelIntoExclusive: Rule = {
  id: "parallel-joined-by-exclusive",
  run(ctx, report) {
    // For each exclusive gateway with several incoming flows, walk backwards a
    // bounded distance. If two incoming paths trace to the same parallel split
    // without passing a parallel join, the exclusive gateway will fire once per
    // branch — a classic duplicate-execution / deadlock pattern.
    for (const { el } of ctx.nodes) {
      if (el.$type !== "bpmn:ExclusiveGateway" || incoming(el).length < 2) continue;
      const origins = new Map<string, number>();
      for (const flow of incoming(el)) {
        const split = traceBackToParallelSplit(flow.sourceRef, 40);
        if (split) origins.set(split.id, (origins.get(split.id) ?? 0) + 1);
      }
      for (const [, count] of origins) {
        if (count >= 2) {
          report(
            "warning",
            `${cap(label(el))} merges branches that were started by a parallel gateway. An exclusive merge does not wait for parallel branches, so everything after it runs once per branch. Use a parallel join to synchronize instead.`,
            el,
          );
          break;
        }
      }
    }

    function traceBackToParallelSplit(node: any, budget: number): any | null {
      let current = node;
      const seen = new Set<string>();
      while (current && budget-- > 0 && !seen.has(current.id)) {
        seen.add(current.id);
        if (current.$type === "bpmn:ParallelGateway") {
          if (incoming(current).length > 1) return null; // passed a join
          if (outgoing(current).length > 1) return current;
        }
        const ins = incoming(current);
        if (ins.length !== 1) return null;
        current = ins[0].sourceRef;
      }
      return null;
    }
  },
};

const flowScope: Rule = {
  id: "flow-scope",
  run(ctx, report) {
    for (const { el, process } of ctx.flows) {
      const sp = el.sourceRef ? ctx.processOf.get(el.sourceRef.id) : undefined;
      const tp = el.targetRef ? ctx.processOf.get(el.targetRef.id) : undefined;
      if (sp && tp && sp !== tp) {
        report(
          "error",
          `The sequence flow ${label(el)} crosses from one pool into another. Communication between pools must use a message flow (dashed line), not a sequence flow.`,
          el,
        );
      }
      void process;
    }
    for (const mf of ctx.collaboration?.messageFlows ?? []) {
      const sp = resolveProcess(ctx, mf.sourceRef);
      const tp = resolveProcess(ctx, mf.targetRef);
      if (sp && tp && sp === tp) {
        report(
          "error",
          `The message flow ${label(mf)} connects two elements inside the same pool. Within a pool, use a sequence flow — message flows are for communication between pools.`,
          mf,
        );
      }
    }

    function resolveProcess(c: RuleContext, ref: any): any {
      if (!ref) return undefined;
      if (ref.$type === "bpmn:Participant") return ref.processRef;
      return c.processOf.get(ref.id);
    }
  },
};

const naming: Rule = {
  id: "naming",
  run(ctx, report) {
    for (const { el } of ctx.nodes) {
      if (isActivity(el) && !el.name) {
        report(
          "hint",
          `${cap(label(el))} has no name. Unnamed tasks make the diagram unreadable to anyone but its author.`,
          el,
        );
      }
      if (isGateway(el) && outgoing(el).length > 1 && !el.name) {
        report(
          "hint",
          `${cap(label(el))} splits the flow but asks no question. Name the gateway (for example "Approved?") so readers know what is being decided.`,
          el,
        );
      }
      if (el.$type === "bpmn:ExclusiveGateway" && outgoing(el).length > 1) {
        for (const f of outgoing(el)) {
          if (!f.name && f !== el.default) {
            report(
              "hint",
              `A path leaving ${label(el)} is unlabeled. Label each outcome (for example "Yes" / "No") so the decision reads without opening conditions.`,
              f,
            );
          }
        }
      }
    }
  },
};

const boundaryEvents: Rule = {
  id: "boundary-events",
  run(ctx, report) {
    for (const { el } of ctx.nodes) {
      if (el.$type !== "bpmn:BoundaryEvent") continue;
      if (!el.attachedToRef) {
        report(
          "error",
          `${cap(label(el))} is a boundary event that is not attached to any activity, so it can never trigger.`,
          el,
        );
      }
      if (!outgoing(el).length) {
        const interrupting = el.cancelActivity !== false;
        report(
          interrupting ? "warning" : "warning",
          interrupting
            ? `${cap(label(el))} interrupts its activity but leads nowhere — when it fires, the process just stops.`
            : `${cap(label(el))} is non-interrupting and has no outgoing path, so firing it does nothing at all.`,
          el,
        );
      }
    }
  },
};

const eventSubprocessEntry: Rule = {
  id: "event-subprocess-entry",
  run(ctx, report) {
    for (const { el } of ctx.nodes) {
      if (!isEventSubProcess(el)) continue;
      const children = (el.flowElements ?? []).filter((c: any) => /Event$|Task$|Gateway$|Activity$|SubProcess$/.test(c.$type));
      const starts = children.filter((c: any) => c.$type === "bpmn:StartEvent");
      if (!starts.length) {
        report(
          "error",
          `The event subprocess ${label(el)} has no start event. An event subprocess only runs when its start event triggers, so without one it is dead code.`,
          el,
        );
      }
      for (const s of starts) {
        if (!(s.eventDefinitions ?? []).length) {
          report(
            "error",
            `The start event in event subprocess ${label(el)} has no trigger (message, timer, error…). An event subprocess must react to something specific.`,
            s,
          );
        }
      }
      for (const c of children) {
        if (
          c.$type !== "bpmn:StartEvent" &&
          !(c.incoming ?? []).length &&
          c.$type !== "bpmn:BoundaryEvent" &&
          !(c.$type === "bpmn:SubProcess" && c.triggeredByEvent)
        ) {
          report(
            "warning",
            `${cap(label(c))} sits in an event subprocess but is not connected from its start event, so it will never run.`,
            c,
          );
        }
      }
    }
  },
};

const ids: Rule = {
  id: "ids",
  run(ctx, report) {
    // Duplicate ids can't survive moddle parsing, so scan the raw XML.
    const counts = new Map<string, number>();
    const re = /\sid="([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ctx.xml))) {
      counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    }
    for (const [id, count] of counts) {
      if (count > 1) {
        report(
          "error",
          `The id "${id}" is used ${count} times. Ids must be unique — engines and other tools will reject or silently misread this file.`,
        );
      }
      if (id && !/^[A-Za-z_][\w.-]*$/.test(id)) {
        report(
          "error",
          `The id "${id}" contains characters that are not allowed in XML ids (it must start with a letter or underscore and contain no spaces).`,
        );
      }
    }
  },
};

const lanes: Rule = {
  id: "lanes",
  run(ctx, report) {
    for (const process of ctx.processes) {
      const laneSets: any[] = process.laneSets ?? [];
      const allLanes = laneSets.flatMap((ls) => ls.lanes ?? []);
      if (!allLanes.length) continue;
      const covered = new Set<string>();
      for (const lane of allLanes) {
        const refs = lane.flowNodeRef ?? [];
        if (!refs.length) {
          report(
            "hint",
            `The lane ${label(lane)} contains no elements. Empty lanes suggest a responsibility that was never modeled.`,
            lane,
          );
        }
        for (const ref of refs) covered.add(ref.id);
      }
      for (const n of ctx.nodes) {
        if (n.container !== process) continue;
        if (n.el.$type === "bpmn:BoundaryEvent") continue;
        if (!covered.has(n.el.id)) {
          report(
            "warning",
            `${cap(label(n.el))} is not assigned to any lane, so no one can tell who is responsible for it.`,
            n.el,
          );
        }
      }
    }
  },
};

const reachability: Rule = {
  id: "reachability",
  run(ctx, report) {
    for (const process of ctx.processes) {
      const nodes = ctx.nodes.filter((n) => n.process === process);
      const starts = nodes.filter(
        (n) =>
          n.el.$type === "bpmn:StartEvent" ||
          n.el.$type === "bpmn:BoundaryEvent" ||
          isEventSubProcess(n.el),
      );
      if (!starts.some((n) => n.el.$type === "bpmn:StartEvent")) continue;

      const reached = new Set<string>();
      const queue = starts.map((n) => n.el);
      while (queue.length) {
        const el = queue.pop()!;
        if (reached.has(el.id)) continue;
        reached.add(el.id);
        for (const f of outgoing(el)) {
          if (f.targetRef) queue.push(f.targetRef);
        }
        // subprocess children start when the subprocess does
        for (const c of el.flowElements ?? []) {
          if (c.$type === "bpmn:StartEvent" || !(c.incoming ?? []).length) queue.push(c);
        }
        if (el.$type === "bpmn:BoundaryEvent" && el.attachedToRef) {
          // reachable only if its host is; approximate by deferring
        }
      }

      for (const n of nodes) {
        const el = n.el;
        if (reached.has(el.id)) continue;
        if (el.$type === "bpmn:BoundaryEvent") continue;
        if (isEventSubProcess(el) || isEventSubProcess(n.container)) continue;
        if (!(el.incoming ?? []).length && !(el.outgoing ?? []).length) continue; // already reported as unconnected
        report(
          "warning",
          `${cap(label(el))} can never be reached from a start event. It is drawn, but no token will ever arrive there.`,
          el,
        );
      }
    }
  },
};

const infiniteLoop: Rule = {
  id: "infinite-loop",
  run(ctx, report) {
    // Strongly connected components with no edge leaving the component are
    // loops with no exit.
    for (const process of ctx.processes) {
      const nodes = ctx.nodes.filter((n) => n.process === process).map((n) => n.el);
      const idset = new Set(nodes.map((n) => n.id));
      const adj = new Map<string, string[]>();
      for (const n of nodes) {
        adj.set(
          n.id,
          outgoing(n)
            .map((f: any) => f.targetRef?.id)
            .filter((id: string) => id && idset.has(id)),
        );
      }
      const sccs = tarjan(adj);
      for (const scc of sccs) {
        const inScc = new Set(scc);
        const isCycle = scc.length > 1 || adj.get(scc[0])?.includes(scc[0]);
        if (!isCycle) continue;
        const hasExit = scc.some((id) => (adj.get(id) ?? []).some((t) => !inScc.has(t)));
        if (!hasExit) {
          const first = nodes.find((n) => n.id === scc[0]);
          report(
            "error",
            `The loop through ${label(first)} has no exit condition — once entered, the process cycles forever and can never finish.`,
            first,
          );
        }
      }
    }
  },
};

function tarjan(adj: Map<string, string[]>): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result: string[][] = [];

  const strongconnect = (v: string) => {
    indices.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongconnect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, indices.get(w)!));
      }
    }
    if (low.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      result.push(scc);
    }
  };

  for (const v of adj.keys()) {
    if (!indices.has(v)) strongconnect(v);
  }
  return result;
}

function processLabel(ctx: RuleContext, process: any): string {
  const participant = ctx.collaboration?.participants?.find((p: any) => p.processRef === process);
  if (participant?.name) return `The pool "${participant.name}"`;
  if (process.name) return `The process "${process.name}"`;
  return "The process";
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const RULES: Rule[] = [
  connectivity,
  startEndPresence,
  pointlessGateway,
  exclusiveConditions,
  splitJoin,
  parallelIntoExclusive,
  flowScope,
  naming,
  boundaryEvents,
  eventSubprocessEntry,
  ids,
  lanes,
  reachability,
  infiniteLoop,
];

export type { Finding };
