import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";

export function Dialog({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, var(--text) 32%, transparent)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-lg outline-none"
        style={{
          maxWidth: wide ? 760 : 480,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-2)",
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between px-4"
          style={{ height: 44, borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="m-0 text-[13px] font-semibold" style={{ color: "var(--text)" }}>
            {title}
          </h2>
          <button className="chrome-btn" onClick={onClose} aria-label="Close dialog">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
