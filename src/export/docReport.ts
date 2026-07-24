/**
 * Element documentation report: every element that carries a documentation
 * field, grouped by process, exported as Markdown.
 */

function docText(el: any): string {
  const docs: any[] = el.documentation ?? [];
  return docs
    .map((d) => d.text ?? "")
    .join("\n")
    .trim();
}

function typeLabel(el: any): string {
  return (el.$type ?? "")
    .replace(/^bpmn:/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function documentationReport(definitions: any, diagramName: string): string {
  const rootElements: any[] = definitions.rootElements ?? [];
  const collaboration = rootElements.find((r) => r.$type === "bpmn:Collaboration");
  const processes = rootElements.filter((r) => r.$type === "bpmn:Process");

  const out: string[] = [`# ${diagramName} — element documentation`, ""];
  let documented = 0;

  for (const process of processes) {
    const participant = collaboration?.participants?.find((p: any) => p.processRef === process);
    const title = participant?.name || process.name || "Process";
    const section: string[] = [];

    const processDoc = docText(process);
    if (processDoc) {
      section.push(processDoc, "");
      documented++;
    }

    const walk = (container: any) => {
      for (const el of container.flowElements ?? []) {
        const doc = docText(el);
        if (doc) {
          documented++;
          const label = el.name?.trim() || el.id;
          section.push(`### ${label}`, "", `*${typeLabel(el)}*`, "", doc, "");
        }
        if (/bpmn:(SubProcess|Transaction|AdHocSubProcess)$/.test(el.$type)) walk(el);
      }
    };
    walk(process);

    if (section.length) {
      out.push(`## ${title}`, "", ...section);
    }
  }

  if (!documented) {
    out.push(
      "No elements carry documentation yet. Select an element and fill in its Documentation field in the properties panel; it will appear here.",
    );
  }

  return out.join("\n").trim() + "\n";
}
