import { ReactNode } from "react";
import { AlertTriangle, Info, OctagonAlert, X } from "lucide-react";

export type NoticeKind = "info" | "warning" | "error";

const STYLES: Record<NoticeKind, { bg: string; fg: string }> = {
  info: { bg: "var(--hint-soft)", fg: "var(--hint)" },
  warning: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  error: { bg: "var(--danger-soft)", fg: "var(--danger)" },
};

const ICONS: Record<NoticeKind, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  error: OctagonAlert,
};

/** Inline notice — appears where the action happened, never a vanishing toast. */
export function Notice({
  kind,
  children,
  onDismiss,
  actions,
}: {
  kind: NoticeKind;
  children: ReactNode;
  onDismiss?: () => void;
  actions?: ReactNode;
}) {
  const Icon = ICONS[kind];
  const s = STYLES[kind];
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className="flex items-start gap-2 rounded-md px-3 py-2 text-[12.5px] leading-relaxed"
      style={{ background: s.bg, color: "var(--text)" }}
    >
      <Icon size={16} strokeWidth={1.5} style={{ color: s.fg, flexShrink: 0, marginTop: 1 }} />
      <div className="min-w-0 flex-1">{children}</div>
      {actions}
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded p-0.5"
          style={{ color: "var(--text-muted)" }}
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
