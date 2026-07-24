import { useEffect, useRef, useState } from "react";
import { Download, Pencil, X } from "lucide-react";
import { createViewer } from "../bpmn/viewer";
import { downloadText } from "../files/fileAccess";
import { Notice } from "../ui/Notice";

/**
 * Read-only view for shared-link diagrams. Editing starts an explicit copy —
 * the link itself is immutable.
 */
export function ReadOnlyView({
  xml,
  onEditCopy,
  onExit,
}: {
  xml: string;
  onEditCopy: () => void;
  onExit: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const viewer = createViewer(hostRef.current);
    viewer
      .importXML(xml)
      .then(() => viewer.get("canvas").zoom("fit-viewport", "auto"))
      .catch(() =>
        setError("The shared diagram could not be rendered — the link may be incomplete."),
      );
    return () => viewer.destroy();
  }, [xml]);

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: "var(--bg)" }}>
      <header
        className="app-chrome flex shrink-0 items-center gap-2 px-3"
        style={{ height: 44, borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
          BPMN Studio
        </span>
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Shared diagram — read-only
        </span>
        <div className="flex-1" />
        <button className="chrome-btn" onClick={() => downloadText(xml, "shared-diagram.bpmn", "application/xml")}>
          <Download size={15} strokeWidth={1.5} />
          Download
        </button>
        <button className="primary-btn" style={{ height: 30 }} onClick={onEditCopy}>
          <Pencil size={14} strokeWidth={1.5} />
          Edit a copy
        </button>
        <button className="chrome-btn" onClick={onExit} aria-label="Close shared view">
          <X size={16} strokeWidth={1.5} />
        </button>
      </header>
      <div className="relative flex-1">
        <div ref={hostRef} className="canvas-host absolute inset-0" />
        {error && (
          <div className="absolute left-1/2 top-4 w-full max-w-md -translate-x-1/2 px-4">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
      </div>
    </div>
  );
}
