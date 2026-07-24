/**
 * Process step list generator: traverses the diagram from its start events
 * and emits a numbered, indented step list with decision branches expanded —
 * the accessible representation of the diagram and a paste-ready BRD artifact.
 */

interface Line {
  depth: number;
  text: string;
  numbered: boolean;
}

function name(el: any, fallback: string): string {
  return el?.name?.trim() || fallback;
}

function typeLabel(el: any): string {
  const t = (el.$type ?? "").replace(/^bpmn:/, "");
  return t.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function flowLabel(flow: any): string {
  if (flow.name?.trim()) return flow.name.trim();
  if (flow.conditionExpression?.body) return `if ${flow.conditionExpression.body}`;
  return "";
}

export function generateStepLines(definitions: any): { title: string; lines: Line[] }[] {
  const rootElements: any[] = definitions.rootElements ?? [];
  const collaboration = rootElements.find((r) => r.$type === "bpmn:Collaboration");
  const processes = rootElements.filter(
    (r) => r.$type === "bpmn:Process" && (r.flowElements ?? []).length,
  );

  return processes.map((process) => {
    const participant = collaboration?.participants?.find((p: any) => p.processRef === process);
    const title = participant?.name || process.name || "Process";
    const lines: Line[] = [];
    const visited = new Set<string>();

    const starts = (process.flowElements ?? []).filter(
      (el: any) => el.$type === "bpmn:StartEvent",
    );
    const entryPoints = starts.length
      ? starts
      : (process.flowElements ?? []).filter(
          (el: any) => /Task$|Event$|Gateway$/.test(el.$type) && !(el.incoming ?? []).length,
        );

    for (const start of entryPoints) {
      walk(start, 0);
    }

    function walk(el: any, depth: number): void {
      let current: any = el;
      while (current) {
        if (visited.has(current.id)) {
          lines.push({
            depth,
            text: `(returns to "${name(current, typeLabel(current))}")`,
            numbered: false,
          });
          return;
        }
        visited.add(current.id);

        const outs: any[] = current.outgoing ?? [];
        emit(current, depth);
        emitBoundaries(current, depth);

        if (!outs.length) return;

        if (outs.length === 1) {
          current = outs[0].targetRef;
          continue;
        }

        const isParallel = current.$type === "bpmn:ParallelGateway";
        outs.forEach((flow: any) => {
          const branchName = flowLabel(flow);
          const isDefault = current.default === flow;
          const header = isParallel
            ? `In parallel${branchName ? ` — ${branchName}` : ""}:`
            : `${branchName || "Otherwise"}${isDefault ? " (default)" : ""}:`;
          lines.push({ depth: depth + 1, text: header, numbered: false });
          if (flow.targetRef) walk(flow.targetRef, depth + 2);
        });
        return;
      }
    }

    function emit(el: any, depth: number) {
      const t = el.$type;
      if (t === "bpmn:StartEvent") {
        lines.push({ depth, text: `Start: ${name(el, "process begins")}`, numbered: true });
      } else if (t === "bpmn:EndEvent") {
        lines.push({ depth, text: `End: ${name(el, "process ends")}`, numbered: true });
      } else if (/Gateway$/.test(t)) {
        const outs = el.outgoing ?? [];
        if (outs.length > 1) {
          const kind = t === "bpmn:ParallelGateway" ? "Split" : "Decision";
          lines.push({ depth, text: `${kind}: ${name(el, typeLabel(el))}`, numbered: true });
        }
        // pass-through gateways (joins) produce no step
      } else if (/Event$/.test(t)) {
        lines.push({ depth, text: `Wait for: ${name(el, typeLabel(el))}`, numbered: true });
      } else {
        lines.push({ depth, text: name(el, `unnamed ${typeLabel(el)}`), numbered: true });
      }
    }

    function emitBoundaries(el: any, depth: number) {
      const boundaries = (process.flowElements ?? []).filter(
        (b: any) => b.$type === "bpmn:BoundaryEvent" && b.attachedToRef === el,
      );
      for (const b of boundaries) {
        lines.push({
          depth: depth + 1,
          text: `If ${name(b, "the attached event")} occurs:`,
          numbered: false,
        });
        for (const f of b.outgoing ?? []) {
          if (f.targetRef) walk(f.targetRef, depth + 2);
        }
      }
    }

    return { title, lines };
  });
}

function render(
  sections: { title: string; lines: Line[] }[],
  opts: { markdown: boolean },
): string {
  const out: string[] = [];
  for (const section of sections) {
    out.push(opts.markdown ? `## ${section.title}` : section.title.toUpperCase());
    out.push("");
    const counters: number[] = [];
    for (const line of section.lines) {
      const indent = "    ".repeat(line.depth);
      if (line.numbered) {
        counters[line.depth] = (counters[line.depth] ?? 0) + 1;
        counters.length = line.depth + 1;
        out.push(`${indent}${counters[line.depth]}. ${line.text}`);
      } else {
        out.push(`${indent}- ${line.text}`);
      }
    }
    out.push("");
  }
  return out.join("\n").trim() + "\n";
}

export function stepListMarkdown(definitions: any): string {
  return render(generateStepLines(definitions), { markdown: true });
}

export function stepListPlainText(definitions: any): string {
  return render(generateStepLines(definitions), { markdown: false });
}
