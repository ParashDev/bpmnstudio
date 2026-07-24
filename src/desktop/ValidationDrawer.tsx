import { AlertTriangle, CheckCircle2, CircleAlert, Lightbulb, X } from "lucide-react";
import type { Finding, Severity } from "../validation";

const ICONS: Record<Severity, { icon: typeof CircleAlert; color: string }> = {
  error: { icon: CircleAlert, color: "var(--danger)" },
  warning: { icon: AlertTriangle, color: "var(--warn)" },
  hint: { icon: Lightbulb, color: "var(--hint)" },
};

export function ValidationDrawer({
  findings,
  onSelect,
  onClose,
}: {
  findings: Finding[];
  onSelect: (f: Finding) => void;
  onClose: () => void;
}) {
  return (
    <section
      aria-label="Validation findings"
      className="no-print absolute bottom-3 left-3 right-3 z-30 flex max-h-[45%] flex-col overflow-hidden rounded-lg md:left-16 md:right-16"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-2)",
      }}
    >
      <header
        className="flex shrink-0 items-center justify-between px-3"
        style={{ height: 36, borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
          Validation
          <span className="ml-2 font-normal" style={{ color: "var(--text-muted)" }}>
            {findings.length === 0
              ? "no findings"
              : `${findings.length} finding${findings.length > 1 ? "s" : ""} — click one to locate it`}
          </span>
        </span>
        <button className="chrome-btn" onClick={onClose} aria-label="Close validation panel">
          <X size={15} strokeWidth={1.5} />
        </button>
      </header>

      <div className="min-h-0 overflow-y-auto">
        {findings.length === 0 ? (
          <div
            className="flex items-center gap-2 px-4 py-5 text-[12.5px]"
            style={{ color: "var(--text-secondary)" }}
          >
            <CheckCircle2 size={16} strokeWidth={1.5} style={{ color: "var(--ok)" }} />
            No structural problems found. Validation checks connectivity, gateway logic, pools
            and lanes, reachability, and naming.
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
            {findings.map((f, i) => {
              const { icon: Icon, color } = ICONS[f.severity];
              return (
                <li key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <button
                    className="flex w-full items-start gap-2.5 px-3 py-2 text-left text-[12.5px] leading-relaxed hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--text)" }}
                    onClick={() => onSelect(f)}
                    disabled={!f.elementId}
                  >
                    <Icon
                      size={15}
                      strokeWidth={1.5}
                      style={{ color, flexShrink: 0, marginTop: 2 }}
                      aria-label={f.severity}
                    />
                    <span className="min-w-0">{f.message}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
