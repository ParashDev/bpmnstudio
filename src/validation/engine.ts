/**
 * Rule runner. Shared between the worker (normal path) and the synchronous
 * fallback when Workers are unavailable.
 */
import BpmnModdle from "bpmn-moddle";
import { buildContext, label } from "./model";
import { RULES } from "./rules";
import type { Finding, Severity, ValidationResult } from "./types";

export async function validateXml(xml: string): Promise<ValidationResult> {
  const moddle = new BpmnModdle();
  let definitions: any;
  try {
    const parsed = await moddle.fromXML(xml);
    definitions = parsed.rootElement;
  } catch {
    // Unparseable XML is handled by the import path; validation stays silent.
    return { findings: [], elementCount: 0 };
  }

  const ctx = buildContext(definitions, xml);
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    const report = (severity: Severity, message: string, el?: any) => {
      const key = `${rule.id}|${el?.id ?? ""}|${message}`;
      if (seen.has(key)) return;
      seen.add(key);
      findings.push({
        rule: rule.id,
        severity,
        message,
        elementId: el?.id,
        elementLabel: el ? label(el) : undefined,
      });
    };
    try {
      rule.run(ctx, report);
    } catch {
      // A defective rule must never take validation down with it.
    }
  }

  const order: Record<Severity, number> = { error: 0, warning: 1, hint: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return { findings, elementCount: ctx.nodes.length + ctx.flows.length };
}
