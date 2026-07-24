export type Severity = "error" | "warning" | "hint";

export interface Finding {
  /** stable rule identifier, e.g. "exclusive-gateway-no-conditions" */
  rule: string;
  severity: Severity;
  /** plain-language problem plus its consequence */
  message: string;
  /** id of the offending element, when one exists to select */
  elementId?: string;
  /** display label of the element for the findings list */
  elementLabel?: string;
}

export interface ValidationResult {
  findings: Finding[];
  /** total elements examined (used for the large-diagram notice) */
  elementCount: number;
}
