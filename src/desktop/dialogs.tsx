import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, FileUp, Link2 } from "lucide-react";
import { Dialog } from "../ui/Dialog";
import { Notice, type NoticeKind } from "../ui/Notice";
import { decorateSvg, svgToPngBlob } from "../export/image";
import {
  ShareTooLongError,
  ShareUnavailableError,
  encodeShareUrl,
} from "../export/share";
import { stepListMarkdown, stepListPlainText } from "../export/stepList";
import { documentationReport } from "../export/docReport";
import { diffBpmn, type DiffResult } from "../diff/diff";
import { downloadBlob, downloadText, openFilePicker } from "../files/fileAccess";
import { clearAllLocalData } from "../storage/db";
import { templates, buildXml, thumbnailSvg } from "../bpmn/templates";
import { env } from "../env";

/* ------------------------------ helpers ------------------------------ */

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return [copied, copy];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        className="mb-1 block text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text)",
  borderRadius: 6,
  height: 30,
  padding: "0 8px",
  fontSize: 13,
  width: "100%",
};

/* ------------------------------ export ------------------------------ */

export function ExportDialog({
  modeler,
  fileName,
  onNotice,
  onClose,
}: {
  modeler: any;
  fileName: string;
  onNotice: (kind: NoticeKind, text: string) => void;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<"bpmn" | "svg" | "png">("bpmn");
  const [scale, setScale] = useState<1 | 2 | 3>(2);
  const [bg, setBg] = useState<"white" | "transparent">("white");
  const [padding, setPadding] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, copy] = useCopy();

  const base = fileName.replace(/\.(bpmn|xml)$/i, "");
  const empty = useMemo(() => {
    try {
      return modeler.get("elementRegistry").getAll().filter((e: any) => e.type !== "bpmn:Process" && !e.waypoints).length <= 1;
    } catch {
      return false;
    }
  }, [modeler]);

  const doExport = async () => {
    setBusy(true);
    setError(null);
    try {
      if (format === "bpmn") {
        const { xml } = await modeler.saveXML({ format: true });
        downloadText(xml, `${base}.bpmn`, "application/xml");
      } else {
        const { svg } = await modeler.saveSVG();
        const background = bg === "transparent" ? "transparent" : "#ffffff";
        if (format === "svg") {
          downloadText(decorateSvg(svg, { background, padding }), `${base}.svg`, "image/svg+xml");
        } else {
          const blob = await svgToPngBlob(svg, { background, padding, scale });
          downloadBlob(blob, `${base}@${scale}x.png`);
        }
      }
      onNotice("info", `Exported ${format.toUpperCase()} for "${base}".`);
      onClose();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  const doShare = async () => {
    setShareError(null);
    setShareUrl(null);
    try {
      const { xml } = await modeler.saveXML({ format: true });
      const url = await encodeShareUrl(xml);
      setShareUrl(url);
    } catch (err) {
      if (err instanceof ShareTooLongError || err instanceof ShareUnavailableError) {
        setShareError(err.message);
      } else {
        setShareError("The share link could not be created.");
      }
    }
  };

  return (
    <Dialog title="Export and share" onClose={onClose}>
      <div className="space-y-4">
        {empty && (
          <Notice kind="info">
            The diagram is empty — the export will contain only a blank process.
          </Notice>
        )}
        <Field label="Format">
          <div className="flex gap-2">
            {(["bpmn", "svg", "png"] as const).map((f) => (
              <button
                key={f}
                className="secondary-btn flex-1"
                aria-pressed={format === f}
                style={
                  format === f
                    ? { borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-soft)" }
                    : undefined
                }
                onClick={() => setFormat(f)}
              >
                {f === "bpmn" ? "BPMN XML" : f.toUpperCase()}
              </button>
            ))}
          </div>
        </Field>

        {format !== "bpmn" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Background">
              <select
                style={inputStyle}
                value={bg}
                onChange={(e) => setBg(e.target.value as "white" | "transparent")}
              >
                <option value="white">Solid white</option>
                <option value="transparent">Transparent</option>
              </select>
            </Field>
            <Field label="Padding (px)">
              <input
                type="number"
                min={0}
                max={200}
                style={inputStyle}
                value={padding}
                onChange={(e) => setPadding(Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
            {format === "png" && (
              <Field label="Resolution">
                <select
                  style={inputStyle}
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value) as 1 | 2 | 3)}
                >
                  <option value={1}>1x — screen</option>
                  <option value={2}>2x — documents</option>
                  <option value={3}>3x — print</option>
                </select>
              </Field>
            )}
          </div>
        )}

        {error && <Notice kind="error">{error}</Notice>}

        <button className="primary-btn w-full" onClick={doExport} disabled={busy}>
          <Download size={16} strokeWidth={1.5} />
          {busy ? "Exporting" : `Export ${format.toUpperCase()}`}
        </button>

        <div style={{ borderTop: "1px solid var(--border)" }} className="pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--text)" }}>
              Share as link
            </span>
            <button className="chrome-btn" onClick={doShare}>
              <Link2 size={14} strokeWidth={1.5} />
              Create link
            </button>
          </div>
          <p className="mb-2 mt-0 text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            The entire diagram is compressed into the link itself (after the #). It is never sent
            to a server — anyone opening it gets a read-only view with an option to edit a copy.
          </p>
          {shareError && <Notice kind="error">{shareError}</Notice>}
          {shareUrl && (
            <div className="flex gap-2">
              <input readOnly value={shareUrl} style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 11 }} onFocus={(e) => e.target.select()} />
              <button className="secondary-btn shrink-0" onClick={() => copy(shareUrl)}>
                {copied ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/* --------------------------- text-artifact dialogs --------------------------- */

function TextArtifactDialog({
  title,
  fileBase,
  variants,
  onClose,
}: {
  title: string;
  fileBase: string;
  variants: { label: string; ext: string; mime: string; text: string }[];
  onClose: () => void;
}) {
  const [active, setActive] = useState(0);
  const [copied, copy] = useCopy();
  const current = variants[active];

  return (
    <Dialog title={title} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {variants.map((v, i) => (
              <button
                key={v.label}
                className="chrome-btn"
                aria-pressed={i === active}
                onClick={() => setActive(i)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="chrome-btn" onClick={() => copy(current.text)}>
              {copied ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              className="chrome-btn"
              onClick={() => downloadText(current.text, `${fileBase}${current.ext}`, current.mime)}
            >
              <Download size={14} strokeWidth={1.5} />
              Download
            </button>
          </div>
        </div>
        <pre
          className="m-0 max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-md p-3 text-[12px] leading-relaxed"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            fontFamily: "var(--font-mono)",
            color: "var(--text)",
          }}
        >
          {current.text}
        </pre>
      </div>
    </Dialog>
  );
}

export function StepListDialog({
  modeler,
  fileName,
  onClose,
}: {
  modeler: any;
  fileName: string;
  onClose: () => void;
}) {
  const definitions = modeler.getDefinitions();
  const md = useMemo(() => stepListMarkdown(definitions), [definitions]);
  const txt = useMemo(() => stepListPlainText(definitions), [definitions]);
  return (
    <TextArtifactDialog
      title="Process step list"
      fileBase={fileName.replace(/\.(bpmn|xml)$/i, "") + "-steps"}
      variants={[
        { label: "Markdown", ext: ".md", mime: "text/markdown", text: md },
        { label: "Plain text", ext: ".txt", mime: "text/plain", text: txt },
      ]}
      onClose={onClose}
    />
  );
}

export function DocReportDialog({
  modeler,
  fileName,
  onClose,
}: {
  modeler: any;
  fileName: string;
  onClose: () => void;
}) {
  const base = fileName.replace(/\.(bpmn|xml)$/i, "");
  const report = useMemo(
    () => documentationReport(modeler.getDefinitions(), base),
    [modeler, base],
  );
  return (
    <TextArtifactDialog
      title="Element documentation report"
      fileBase={`${base}-documentation`}
      variants={[{ label: "Markdown", ext: ".md", mime: "text/markdown", text: report }]}
      onClose={onClose}
    />
  );
}

export function XmlDialog({
  modeler,
  fileName,
  onClose,
}: {
  modeler: any;
  fileName: string;
  onClose: () => void;
}) {
  const [xml, setXml] = useState("");
  const [copied, copy] = useCopy();
  useEffect(() => {
    modeler.saveXML({ format: true }).then((r: any) => setXml(r.xml ?? ""));
  }, [modeler]);

  return (
    <Dialog title="BPMN 2.0 XML" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex justify-end gap-2">
          <button className="chrome-btn" onClick={() => copy(xml)}>
            {copied ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            className="chrome-btn"
            onClick={() => downloadText(xml, fileName, "application/xml")}
          >
            <Download size={14} strokeWidth={1.5} />
            Download
          </button>
        </div>
        <pre
          className="m-0 max-h-[55vh] overflow-auto rounded-md p-3 text-[11.5px] leading-relaxed"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            fontFamily: "var(--font-mono)",
            color: "var(--text)",
          }}
        >
          {xml || "Serializing"}
        </pre>
      </div>
    </Dialog>
  );
}

/* ------------------------------ diff ------------------------------ */

export function DiffDialog({ modeler, onClose }: { modeler: any; onClose: () => void }) {
  const [a, setA] = useState<{ name: string; xml: string } | null>(null);
  const [b, setB] = useState<{ name: string; xml: string } | null>(null);
  const [result, setResult] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (which: "a" | "b") => {
    const f = await openFilePicker();
    if (!f) return;
    (which === "a" ? setA : setB)({ name: f.name, xml: f.text });
  };

  const useCurrent = async (which: "a" | "b") => {
    const { xml } = await modeler.saveXML({ format: true });
    (which === "a" ? setA : setB)({ name: "Current diagram", xml });
  };

  useEffect(() => {
    if (!a || !b) return;
    setError(null);
    setResult(null);
    diffBpmn(a.xml, b.xml)
      .then(setResult)
      .catch(() => setError("One of the files could not be parsed as BPMN 2.0."));
  }, [a, b]);

  const Side = ({ which, value }: { which: "a" | "b"; value: { name: string } | null }) => (
    <div
      className="flex-1 rounded-md p-3"
      style={{ border: "1px dashed var(--border-strong)" }}
    >
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        {which === "a" ? "Before" : "After"}
      </div>
      <div className="mb-2 truncate text-[12.5px]" style={{ color: "var(--text)" }}>
        {value?.name ?? "No file selected"}
      </div>
      <div className="flex gap-2">
        <button className="chrome-btn" onClick={() => pick(which)}>
          <FileUp size={14} strokeWidth={1.5} />
          Choose file
        </button>
        <button className="chrome-btn" onClick={() => useCurrent(which)}>
          Use current
        </button>
      </div>
    </div>
  );

  const Section = ({
    title,
    color,
    entries,
  }: {
    title: string;
    color: string;
    entries: DiffResult["added"];
  }) =>
    entries.length ? (
      <div>
        <div className="mb-1 text-[12px] font-semibold" style={{ color }}>
          {title} ({entries.length})
        </div>
        <ul className="m-0 list-none space-y-1 p-0">
          {entries.map((e) => (
            <li key={e.id} className="text-[12px] leading-relaxed" style={{ color: "var(--text)" }}>
              <span className="font-medium">{e.label}</span>{" "}
              <span style={{ color: "var(--text-muted)" }}>({e.type})</span>
              {e.changes && (
                <span style={{ color: "var(--text-secondary)" }}> — {e.changes.join("; ")}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <Dialog title="Compare two BPMN files" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex gap-3">
          <Side which="a" value={a} />
          <Side which="b" value={b} />
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        {result && (
          <div className="space-y-3">
            <Section title="Added" color="var(--ok)" entries={result.added} />
            <Section title="Removed" color="var(--danger)" entries={result.removed} />
            <Section title="Changed" color="var(--warn)" entries={result.changed} />
            <p className="m-0 text-[12px]" style={{ color: "var(--text-muted)" }}>
              {result.added.length + result.removed.length + result.changed.length === 0
                ? "The two files are structurally identical."
                : `${result.unchangedCount} elements are unchanged.`}
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* --------------------------- small dialogs --------------------------- */

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["Ctrl+S", "Save (writes to the original file when possible)"],
    ["Ctrl+Shift+S", "Save As"],
    ["Ctrl+O", "Open file"],
    ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"],
    ["Ctrl+C / Ctrl+V", "Copy / paste selection (works across tabs)"],
    ["Ctrl+D", "Duplicate selection"],
    ["Ctrl+A", "Select all"],
    ["Delete", "Remove selection"],
    ["Space (hold) or H", "Hand tool — drag to pan"],
    ["Ctrl+scroll", "Zoom at pointer"],
    ["Arrow keys", "Nudge selected elements"],
    ["L", "Lasso selection"],
    ["S", "Space tool — make room"],
    ["E", "Edit label of selection"],
    ["F", "Search elements"],
    ["Select several elements", "Alignment and distribution appear in the context pad"],
    ["?", "This overlay"],
  ];
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose}>
      <table className="w-full border-collapse text-[12.5px]">
        <tbody>
          {rows.map(([key, desc]) => (
            <tr key={key} style={{ borderBottom: "1px solid var(--border)" }}>
              <td className="py-1.5 pr-4 align-top whitespace-nowrap">
                <span className="kbd">{key}</span>
              </td>
              <td className="py-1.5" style={{ color: "var(--text-secondary)" }}>
                {desc}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

export function ClearDataDialog({
  onCleared,
  onClose,
}: {
  onCleared: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog title="Clear local data" onClose={onClose}>
      <p className="mt-0 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        This removes everything BPMN Studio stores in this browser: the autosave recovery copy,
        the recents list with previews, remembered file permissions, and preferences. Files on
        your disk are not touched. There is no other storage — nothing lives on any server.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button className="secondary-btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary-btn"
          style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
          onClick={async () => {
            await clearAllLocalData();
            onCleared();
            onClose();
          }}
        >
          Clear everything
        </button>
      </div>
    </Dialog>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog title={title} onClose={onClose}>
      <p className="mt-0 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {body}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button className="secondary-btn" onClick={onClose}>
          Cancel
        </button>
        <button className="primary-btn" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

export function NoDiDialog({
  onLayout,
  onViewXml,
  onCancel,
}: {
  onLayout: () => void;
  onViewXml: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog title="This file has no diagram layout" onClose={onCancel}>
      <p className="mt-0 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        The file contains valid BPMN process logic but no diagram interchange (DI) section — no
        positions for any element. This is common for files exported from workflow engines. A
        layout can be generated automatically; it will be functional rather than beautiful, and
        you can rearrange everything afterwards.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button className="chrome-btn" onClick={onViewXml}>
          View XML
        </button>
        <button className="secondary-btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-btn" onClick={onLayout}>
          Generate layout
        </button>
      </div>
    </Dialog>
  );
}

export function ImportErrorDialog({
  message,
  raw,
  onClose,
}: {
  message: string;
  raw: string;
  onClose: () => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, copy] = useCopy();
  return (
    <Dialog title="The file could not be opened" onClose={onClose} wide={showRaw}>
      <Notice kind="error">{message}</Notice>
      <div className="mt-3 flex gap-2">
        <button className="chrome-btn" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? "Hide raw text" : "View raw text"}
        </button>
        {showRaw && (
          <>
            <button className="chrome-btn" onClick={() => copy(raw)}>
              {copied ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              className="chrome-btn"
              onClick={() => downloadText(raw, "recovered.xml", "application/xml")}
            >
              <Download size={14} strokeWidth={1.5} />
              Download
            </button>
          </>
        )}
      </div>
      {showRaw && (
        <pre
          className="mt-3 max-h-[45vh] overflow-auto rounded-md p-3 text-[11.5px] leading-relaxed"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            fontFamily: "var(--font-mono)",
            color: "var(--text)",
          }}
        >
          {raw}
        </pre>
      )}
      <div className="mt-4 flex justify-end">
        <button className="secondary-btn" onClick={onClose}>
          Back to start
        </button>
      </div>
    </Dialog>
  );
}

export function TemplatesDialog({
  onPick,
  onClose,
}: {
  onPick: (xml: string, name: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog title="New from template" onClose={onClose} wide>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {templates.map((t) => (
          <button
            key={t.id}
            className="overflow-hidden rounded-lg text-left"
            style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
            onClick={() => onPick(buildXml(t), t.name)}
          >
            <div
              className="tpl-thumb flex h-24 items-center justify-center p-3"
              style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}
              dangerouslySetInnerHTML={{ __html: thumbnailSvg(t) }}
            />
            <div className="px-3 py-2">
              <div className="text-[12.5px] font-semibold" style={{ color: "var(--text)" }}>
                {t.name}
              </div>
              <div className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                {t.tagline}
              </div>
            </div>
          </button>
        ))}
      </div>
      {!env.compression && (
        <p className="mb-0 mt-3 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          Templates are generated locally like everything else.
        </p>
      )}
    </Dialog>
  );
}
