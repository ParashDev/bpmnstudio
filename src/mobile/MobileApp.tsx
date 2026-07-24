import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CircleAlert,
  Download,
  FolderOpen,
  Lightbulb,
  Maximize2,
  Share2,
  X,
} from "lucide-react";
import type { DeviceClass } from "../platform";
import { createViewer } from "../bpmn/viewer";
import { Landing } from "../desktop/Landing";
import { decodeShareFragment, readShareFragment } from "../export/share";
import { decodeFileBuffer } from "../files/decode";
import { downloadText, downloadBlob } from "../files/fileAccess";
import { svgToPngBlob } from "../export/image";
import { validate, type Finding, type Severity } from "../validation";
import { Notice } from "../ui/Notice";
import { env } from "../env";

const SEV: Record<Severity, { icon: typeof CircleAlert; color: string }> = {
  error: { icon: CircleAlert, color: "var(--danger)" },
  warning: { icon: AlertTriangle, color: "var(--warn)" },
  hint: { icon: Lightbulb, color: "var(--hint)" },
};

interface ElementInfo {
  id: string;
  name: string;
  type: string;
  documentation: string;
  outgoing: { name: string; condition: string; target: string }[];
}

export default function MobileApp({ device }: { device: DeviceClass }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [name, setName] = useState("diagram.bpmn");
  const [error, setError] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [sheet, setSheet] = useState<"none" | "element" | "validation">("none");
  const [element, setElement] = useState<ElementInfo | null>(null);
  const [bannerGone, setBannerGone] = useState(false);

  useEffect(() => {
    document.body.dataset.view = xml ? "editor" : "landing";
  }, [xml]);

  // Shared-link open
  useEffect(() => {
    const fragment = readShareFragment();
    if (!fragment) return;
    decodeShareFragment(fragment)
      .then((decoded) => {
        setName("Shared diagram");
        setXml(decoded);
      })
      .catch(() =>
        setError(
          "This share link could not be decoded — it may have been truncated. Ask for the .bpmn file instead.",
        ),
      );
  }, []);

  // Viewer lifecycle
  useEffect(() => {
    if (!xml || !hostRef.current) return;
    const viewer = createViewer(hostRef.current);
    viewerRef.current = viewer;
    let disposed = false;

    viewer
      .importXML(xml)
      .then(() => {
        if (disposed) return;
        viewer.get("canvas").zoom("fit-viewport", "auto");
        validate(xml).then((r) => !disposed && setFindings(r.findings));
      })
      .catch((err: any) => {
        const message = String(err?.message ?? err);
        setError(
          /no (process|diagram|displayable)/i.test(message)
            ? "This is valid XML but contains no BPMN process to display."
            : "The file could not be parsed as BPMN 2.0 XML.",
        );
        setXml(null);
      });

    const eventBus = viewer.get("eventBus");
    eventBus.on("element.click", (e: any) => {
      const bo = e.element?.businessObject;
      if (!bo || e.element.type === "bpmn:Process" || e.element.id?.endsWith("_plane")) return;
      setElement({
        id: bo.id,
        name: bo.name ?? "",
        type: (bo.$type ?? "").replace(/^bpmn:/, "").replace(/([a-z])([A-Z])/g, "$1 $2"),
        documentation: (bo.documentation ?? []).map((d: any) => d.text).join("\n"),
        outgoing: (bo.outgoing ?? []).map((f: any) => ({
          name: f.name ?? "",
          condition: f.conditionExpression?.body ?? "",
          target: f.targetRef?.name ?? f.targetRef?.id ?? "",
        })),
      });
      setSheet("element");
    });

    // double-tap background: zoom to fit
    let lastTap = 0;
    const onTouchEnd = () => {
      const now = Date.now();
      if (now - lastTap < 300) viewer.get("canvas").zoom("fit-viewport", "auto");
      lastTap = now;
    };
    hostRef.current.addEventListener("touchend", onTouchEnd);

    return () => {
      disposed = true;
      hostRef.current?.removeEventListener("touchend", onTouchEnd);
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [xml]);

  const openFile = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".bpmn,.xml,application/xml,text/xml";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setError(null);
      setName(file.name);
      setXml(decodeFileBuffer(await file.arrayBuffer()));
    };
    input.click();
  }, []);

  const centerFinding = (f: Finding) => {
    if (!f.elementId || !viewerRef.current) return;
    try {
      const el = viewerRef.current.get("elementRegistry").get(f.elementId);
      if (!el) return;
      const canvas = viewerRef.current.get("canvas");
      canvas.scrollToElement(el, { top: 100, right: 60, bottom: 260, left: 60 });
      canvas.addMarker(el, "m-highlight");
      setTimeout(() => {
        try {
          canvas.removeMarker(el, "m-highlight");
        } catch {
          /* diagram replaced meanwhile */
        }
      }, 2200);
    } catch {
      /* element gone */
    }
    setSheet("none");
  };

  const exportPng = async () => {
    if (!viewerRef.current) return;
    const { svg } = await viewerRef.current.saveSVG();
    const blob = await svgToPngBlob(svg, { background: "#ffffff", padding: 20, scale: 2 });
    const file = new File([blob], name.replace(/\.(bpmn|xml)$/i, "") + ".png", {
      type: "image/png",
    });
    if (env.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch {
        /* user cancelled or share failed — download instead */
      }
    }
    downloadBlob(blob, file.name);
  };

  const exportSvg = async () => {
    if (!viewerRef.current) return;
    const { svg } = await viewerRef.current.saveSVG();
    downloadText(svg, name.replace(/\.(bpmn|xml)$/i, "") + ".svg", "image/svg+xml");
  };

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;

  /* ------------------------------- empty state ------------------------------- */

  if (!xml) {
    return (
      <Landing
        viewOnly
        notice={error ?? undefined}
        onOpenDoc={(doc) => {
          setError(null);
          setName(doc.name);
          setXml(doc.xml);
        }}
      />
    );
  }

  /* ------------------------------- viewer ------------------------------- */

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: "var(--bg)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <header
        className="flex shrink-0 items-center gap-1 px-2"
        style={{
          height: 48,
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <button
          className="chrome-btn"
          style={{ height: 40, minWidth: 44, justifyContent: "center" }}
          onClick={() => {
            setXml(null);
            setFindings([]);
            setSheet("none");
            history.replaceState(null, "", location.pathname);
          }}
          aria-label="Back to start"
        >
          ‹
        </button>
        <span className="min-w-0 flex-1 truncate px-1 text-[13px] font-semibold" style={{ color: "var(--text)" }}>
          {name}
        </span>
        <button
          className="chrome-btn"
          style={{ height: 40, minWidth: 44, justifyContent: "center" }}
          onClick={() => setSheet(sheet === "validation" ? "none" : "validation")}
          aria-label="Validation findings"
        >
          {errors > 0 ? (
            <CircleAlert size={18} strokeWidth={1.5} style={{ color: "var(--danger)" }} />
          ) : warnings > 0 ? (
            <AlertTriangle size={18} strokeWidth={1.5} style={{ color: "var(--warn)" }} />
          ) : (
            <CircleAlert size={18} strokeWidth={1.5} style={{ color: "var(--ok)" }} />
          )}
          <span className="text-[12px] tabular-nums">{findings.length}</span>
        </button>
        <button
          className="chrome-btn"
          style={{ height: 40, minWidth: 44, justifyContent: "center" }}
          onClick={() => viewerRef.current?.get("canvas").zoom("fit-viewport", "auto")}
          aria-label="Zoom to fit"
        >
          <Maximize2 size={18} strokeWidth={1.5} />
        </button>
        <button
          className="chrome-btn"
          style={{ height: 40, minWidth: 44, justifyContent: "center" }}
          onClick={exportPng}
          aria-label="Share or export PNG"
        >
          <Share2 size={18} strokeWidth={1.5} />
        </button>
        <button
          className="chrome-btn"
          style={{ height: 40, minWidth: 44, justifyContent: "center" }}
          onClick={exportSvg}
          aria-label="Download SVG"
        >
          <Download size={18} strokeWidth={1.5} />
        </button>
        <button
          className="chrome-btn"
          style={{ height: 40, minWidth: 44, justifyContent: "center" }}
          onClick={openFile}
          aria-label="Open another file"
        >
          <FolderOpen size={18} strokeWidth={1.5} />
        </button>
      </header>

      {!bannerGone && (
        <div
          className="flex shrink-0 items-center gap-2 px-3 py-1.5 text-[12px]"
          style={{ background: "var(--hint-soft)", color: "var(--text-secondary)" }}
        >
          <span className="min-w-0 flex-1">
            Viewing only — editing needs a larger screen, since modeling depends on precise
            pointer input.
          </span>
          <button aria-label="Dismiss" onClick={() => setBannerGone(true)} style={{ color: "var(--text-muted)" }}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="canvas-host absolute inset-0" />
      </div>

      {/* bottom sheets */}
      {sheet !== "none" && (
        <div
          className="absolute inset-x-0 bottom-0 z-40 flex max-h-[55%] flex-col rounded-t-xl"
          style={{
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
            boxShadow: "var(--shadow-2)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <header
            className="flex shrink-0 items-center justify-between px-4"
            style={{ height: 44, borderBottom: "1px solid var(--border)" }}
          >
            <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
              {sheet === "element"
                ? element?.name || element?.type || "Element"
                : `Validation — ${findings.length} finding${findings.length === 1 ? "" : "s"}`}
            </span>
            <button
              className="chrome-btn"
              style={{ minWidth: 44, height: 36, justifyContent: "center" }}
              onClick={() => setSheet("none")}
              aria-label="Close sheet"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </header>
          <div className="min-h-0 overflow-y-auto px-4 py-3">
            {sheet === "element" && element && (
              <dl className="m-0 space-y-3 text-[13px]">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Type
                  </dt>
                  <dd className="m-0" style={{ color: "var(--text)" }}>
                    {element.type}
                  </dd>
                </div>
                {element.documentation && (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      Documentation
                    </dt>
                    <dd className="m-0 whitespace-pre-wrap" style={{ color: "var(--text)" }}>
                      {element.documentation}
                    </dd>
                  </div>
                )}
                {element.outgoing.length > 0 && (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      Outgoing paths
                    </dt>
                    {element.outgoing.map((o, i) => (
                      <dd key={i} className="m-0 mt-1" style={{ color: "var(--text)" }}>
                        {o.name || "unlabeled"} → {o.target}
                        {o.condition && (
                          <span className="block text-[12px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                            {o.condition}
                          </span>
                        )}
                      </dd>
                    ))}
                  </div>
                )}
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Id
                  </dt>
                  <dd className="m-0" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
                    {element.id}
                  </dd>
                </div>
              </dl>
            )}
            {sheet === "validation" &&
              (findings.length === 0 ? (
                <p className="m-0 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  No structural problems found.
                </p>
              ) : (
                <ul className="m-0 list-none space-y-1 p-0">
                  {findings.map((f, i) => {
                    const { icon: Icon, color } = SEV[f.severity];
                    return (
                      <li key={i}>
                        <button
                          className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left text-[13px] leading-relaxed"
                          style={{ color: "var(--text)" }}
                          onClick={() => centerFinding(f)}
                        >
                          <Icon size={16} strokeWidth={1.5} style={{ color, flexShrink: 0, marginTop: 2 }} />
                          {f.message}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
