import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleAlert,
  Grid3x3,
  Lightbulb,
  Moon,
  PanelRight,
  Redo2,
  Sun,
  Undo2,
} from "lucide-react";
import type { DeviceClass } from "../platform";
import { createModeler, duplicateSelection } from "../bpmn/modeler";
import { hasDiSection, autoLayoutXml } from "../bpmn/autoLayout";
import { openFilePicker, saveAs, saveToHandle } from "../files/fileAccess";
import {
  QuotaError,
  clearAutosave,
  putRecent,
  writeAutosave,
} from "../storage/db";
import { validate, type Finding } from "../validation";
import { currentTheme, setTheme, type Theme } from "../theme";
import { Menu } from "../ui/Menu";
import { Notice, type NoticeKind } from "../ui/Notice";
import { BLANK_DIAGRAM } from "../bpmn/blank";
import {
  ClearDataDialog,
  ConfirmDialog,
  DiffDialog,
  DocReportDialog,
  ExportDialog,
  ImportErrorDialog,
  NoDiDialog,
  ShortcutsDialog,
  StepListDialog,
  TemplatesDialog,
  XmlDialog,
} from "./dialogs";
import { ValidationDrawer } from "./ValidationDrawer";

export interface DocInput {
  xml: string;
  name: string;
  handle: FileSystemFileHandle | null;
  origin: "new" | "file" | "template" | "recovered" | "shared-copy" | "recent";
}

type ImportPhase =
  | { kind: "loading" }
  | { kind: "nodi"; xml: string }
  | { kind: "error"; message: string; raw: string }
  | { kind: "ready" };

type DialogKind =
  | null
  | "export"
  | "steps"
  | "docs"
  | "diff"
  | "xml"
  | "shortcuts"
  | "cleardata"
  | "templates"
  | "confirm-leave"
  | "confirm-new";

interface AppNotice {
  id: number;
  kind: NoticeKind;
  text: string;
}

const AUTOSAVE_DEBOUNCE = 2000;
const VALIDATE_DEBOUNCE = 500;
const LARGE_DIAGRAM = 500;

let noticeSeq = 1;

export function Editor({
  doc,
  device,
  dirtyRef,
  onExit,
  onOpenDoc,
}: {
  doc: DocInput;
  device: DeviceClass;
  dirtyRef: MutableRefObject<boolean>;
  onExit: () => void;
  onOpenDoc: (doc: DocInput) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<any>(null);
  const sessionId = useMemo(() => crypto.randomUUID?.() ?? String(Math.random()), []);

  const [phase, setPhase] = useState<ImportPhase>({ kind: "loading" });
  const [fileName, setFileName] = useState(doc.name);
  const [handle, setHandle] = useState<FileSystemFileHandle | null>(doc.handle);
  const [dirty, setDirty] = useState(doc.origin !== "file" && doc.origin !== "recent");
  const [lastSave, setLastSave] = useState<{ kind: "disk" | "download" | "autosave"; at: number } | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [showValidation, setShowValidation] = useState(false);
  const [panelWidth, setPanelWidth] = useState(300);
  const [panelOpen, setPanelOpen] = useState(true);
  const [gridOn, setGridOn] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [theme, setThemeState] = useState<Theme>(currentTheme());
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [staleTab, setStaleTab] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const fileNameRef = useRef(fileName);
  fileNameRef.current = fileName;
  const handleRef = useRef(handle);
  handleRef.current = handle;

  const pushNotice = useCallback((kind: NoticeKind, text: string) => {
    setNotices((prev) => [...prev.slice(-3), { id: noticeSeq++, kind, text }]);
  }, []);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty, dirtyRef]);

  /* ------------------------- modeler lifecycle ------------------------- */

  const importXml = useCallback(
    async (modeler: any, xml: string) => {
      try {
        const { warnings } = await modeler.importXML(xml);
        modeler.get("commandStack").clear();
        const canvas = modeler.get("canvas");
        canvas.resized();
        canvas.zoom("fit-viewport", "auto");
        // Never zoom past 100% on open — a three-element diagram should not
        // fill the screen with giant shapes.
        if (canvas.zoom() > 1) {
          canvas.zoom(1);
        }
        setPhase({ kind: "ready" });
        if (warnings?.length) {
          const shown = warnings
            .slice(0, 3)
            .map((w: any) => w.message ?? String(w))
            .join(" — ");
          pushNotice(
            "warning",
            `The file imported with ${warnings.length} warning${warnings.length > 1 ? "s" : ""}: ${shown}${warnings.length > 3 ? " …" : ""}`,
          );
        }
        const count = modeler.get("elementRegistry").getAll().length;
        if (count > LARGE_DIAGRAM) {
          pushNotice(
            "info",
            `This diagram has ${count} elements. Rendering stays smooth, but validation and export may take a moment.`,
          );
        }
        runValidation();
      } catch (err: any) {
        const message = String(err?.message ?? err);
        const line = /line[:\s]+(\d+)/i.exec(message)?.[1];
        const friendly = /no (process|diagram|displayable)/i.test(message)
          ? "This is valid XML, but it does not contain a BPMN 2.0 process, so there is nothing to display."
          : `The file could not be parsed as XML${line ? ` (problem near line ${line})` : ""}. The raw text is available below so nothing is lost.`;
        setPhase({ kind: "error", message: friendly, raw: xml });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!canvasRef.current || !propsRef.current) return;
    const modeler = createModeler({
      container: canvasRef.current,
      propertiesParent: propsRef.current,
    });
    modelerRef.current = modeler;

    const eventBus = modeler.get("eventBus");
    eventBus.on("commandStack.changed", onModelChanged);
    eventBus.on("canvas.viewbox.changed", (e: any) => setZoom(e.viewbox?.scale ?? 1));

    const looksLikeXml = /^\s*(<\?xml|<)/.test(doc.xml);
    const looksLikeBpmn = /<([\w-]+:)?definitions[\s>]/i.test(doc.xml);
    if (looksLikeXml && looksLikeBpmn && !hasDiSection(doc.xml)) {
      setPhase({ kind: "nodi", xml: doc.xml });
    } else if (looksLikeXml && looksLikeBpmn && /<([\w-]+:)?definitions[^>]*\/>\s*$/.test(doc.xml.trim())) {
      // definitions-only file: open as a fresh blank diagram, keep the name
      importXml(modeler, BLANK_DIAGRAM);
      pushNotice("info", "The file contains only an empty definitions element — starting a blank diagram with its name.");
    } else {
      importXml(modeler, doc.xml);
    }

    return () => {
      modeler.destroy();
      modelerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------- change handling ------------------------- */

  const autosaveTimer = useRef<number | undefined>(undefined);
  const validateTimer = useRef<number | undefined>(undefined);
  const validateSeq = useRef(0);

  function onModelChanged() {
    setDirty(true);
    const cs = modelerRef.current?.get("commandStack");
    setCanUndo(!!cs?.canUndo());
    setCanRedo(!!cs?.canRedo());
    window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(doAutosave, AUTOSAVE_DEBOUNCE);
    window.clearTimeout(validateTimer.current);
    validateTimer.current = window.setTimeout(runValidation, VALIDATE_DEBOUNCE);
  }

  async function currentXml(): Promise<string | null> {
    try {
      const { xml } = await modelerRef.current.saveXML({ format: true });
      return xml ?? null;
    } catch {
      return null;
    }
  }

  async function doAutosave() {
    const xml = await currentXml();
    if (!xml) return;
    try {
      await writeAutosave({
        id: "current",
        xml,
        name: fileNameRef.current,
        savedAt: Date.now(),
        sessionId,
      });
      channelRef.current?.postMessage({ sessionId });
      setLastSave((prev) => (prev?.kind === "disk" ? prev : { kind: "autosave", at: Date.now() }));
    } catch (err) {
      if (err instanceof QuotaError) {
        pushNotice(
          "warning",
          "Browser storage is full — old recents were pruned. If this keeps happening, save to a file and clear local data.",
        );
      }
    }
  }

  async function runValidation() {
    const xml = await currentXml();
    if (!xml) return;
    const seq = ++validateSeq.current;
    const result = await validate(xml);
    if (seq === validateSeq.current) setFindings(result.findings);
  }

  /* --------------------- cross-tab stale detection --------------------- */

  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("bpmn-modeler-tabs");
    channelRef.current = ch;
    ch.onmessage = (e) => {
      if (e.data?.sessionId && e.data.sessionId !== sessionId) setStaleTab(true);
    };
    return () => ch.close();
  }, [sessionId]);

  /* ------------------------------ saving ------------------------------ */

  const save = useCallback(
    async (forcePicker = false) => {
      const xml = await currentXml();
      if (!xml) {
        pushNotice("error", "The diagram could not be serialized. Try undoing the last change.");
        return;
      }
      let usedHandle = handleRef.current;
      if (usedHandle && !forcePicker) {
        const outcome = await saveToHandle(usedHandle, xml);
        if (outcome) {
          finishSave(xml, "disk", usedHandle.name);
          return;
        }
        pushNotice(
          "warning",
          "Permission to write the original file was not granted, so Save As was used instead.",
        );
      }
      const { outcome, handle: newHandle } = await saveAs(xml, fileNameRef.current);
      if (outcome.kind === "cancelled") return;
      if (newHandle) setHandle(newHandle);
      setFileName(outcome.name);
      if (outcome.kind === "downloaded") {
        pushNotice(
          "info",
          "This browser cannot write files in place, so a new copy was downloaded — the original file was not overwritten.",
        );
        finishSave(xml, "download", outcome.name);
      } else {
        finishSave(xml, "disk", outcome.name);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function finishSave(xml: string, kind: "disk" | "download", name: string) {
    setDirty(false);
    setLastSave({ kind, at: Date.now() });
    await clearAutosave();
    await addToRecents(xml, name);
  }

  async function addToRecents(xml: string, name: string) {
    let thumb = "";
    try {
      const { svg } = await modelerRef.current.saveSVG();
      if (svg && svg.length < 400_000) thumb = svg;
    } catch {
      /* no preview */
    }
    try {
      await putRecent({ id: name.toLowerCase(), name, xml, thumb, openedAt: Date.now() });
    } catch {
      /* quota already messaged via autosave path */
    }
  }

  /* ------------------------------ actions ------------------------------ */

  const openFile = useCallback(async () => {
    const file = await openFilePicker();
    if (!file) return;
    if (dirtyRef.current && !window.confirm("You have unsaved changes. Open the file and discard them?")) {
      return;
    }
    onOpenDoc({ xml: file.text, name: file.name, handle: file.handle, origin: "file" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newDiagram = useCallback(() => {
    if (dirtyRef.current) setDialog("confirm-new");
    else onOpenDoc({ xml: BLANK_DIAGRAM, name: "Untitled diagram", handle: null, origin: "new" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exitToLanding = useCallback(() => {
    if (dirtyRef.current) setDialog("confirm-leave");
    else onExit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------- keyboard ---------------------------- */

  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      return (
        !!el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      );
    };
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save(e.shiftKey);
      } else if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        openFile();
      } else if (mod && e.key.toLowerCase() === "d" && !isTyping()) {
        e.preventDefault();
        duplicateSelection(modelerRef.current);
      } else if (e.key === "?" && !isTyping()) {
        setDialog((d) => (d === "shortcuts" ? null : "shortcuts"));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [save, openFile]);

  /* --------------------------- beforeunload --------------------------- */

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirtyRef]);

  /* --------------------------- panel resize --------------------------- */

  const resizing = useRef(false);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const w = Math.min(560, Math.max(240, window.innerWidth - e.clientX));
      setPanelWidth(w);
    };
    const onUp = () => {
      resizing.current = false;
      document.body.style.cursor = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  /* ------------------------------ helpers ------------------------------ */

  const setZoomLevel = (z: number) => {
    const clamped = Math.min(4, Math.max(0.25, z));
    modelerRef.current?.get("canvas").zoom(clamped);
  };

  const zoomFit = () => modelerRef.current?.get("canvas").zoom("fit-viewport", "auto");

  const toggleGrid = () => {
    const next = !gridOn;
    setGridOn(next);
    try {
      modelerRef.current?.get("gridSnapping").setActive(next);
    } catch {
      /* grid snapping module optional */
    }
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  const selectFinding = (f: Finding) => {
    if (!f.elementId) return;
    try {
      const registry = modelerRef.current.get("elementRegistry");
      const el = registry.get(f.elementId);
      if (!el) return;
      const canvas = modelerRef.current.get("canvas");
      canvas.scrollToElement(el, { top: 120, right: 120, bottom: 220, left: 120 });
      modelerRef.current.get("selection").select(el);
    } catch {
      /* element may have been deleted since the finding was produced */
    }
  };

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const hints = findings.filter((f) => f.severity === "hint").length;

  const saveLabel = dirty
    ? "Unsaved changes"
    : lastSave?.kind === "disk"
      ? "Saved to file"
      : lastSave?.kind === "download"
        ? "Saved as download"
        : lastSave?.kind === "autosave"
          ? "Autosaved"
          : "No changes";

  const touch = device === "tablet";

  /* ------------------------------ render ------------------------------ */

  return (
    <div
      className={`editor-layout fixed inset-0 flex flex-col ${touch ? "touch-ui" : ""}`}
      style={{ background: "var(--bg)" }}
    >
      {/* ------------------------------ top bar ------------------------------ */}
      <header
        className="app-chrome flex shrink-0 items-center gap-1 px-2"
        style={{
          height: 44,
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
          paddingRight: "max(0.5rem, env(safe-area-inset-right))",
        }}
      >
        <button
          className="chrome-btn font-semibold"
          style={{ color: "var(--text)" }}
          onClick={exitToLanding}
          title="Back to start page"
        >
          BPMN Studio
        </button>

        <div className="mx-1 h-5 w-px" style={{ background: "var(--border)" }} />

        {renaming ? (
          <input
            autoFocus
            defaultValue={fileName.replace(/\.bpmn$/, "")}
            className="h-7 rounded-md px-2 text-[13px]"
            style={{
              border: "1px solid var(--accent)",
              background: "var(--surface)",
              color: "var(--text)",
              width: 220,
            }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) setFileName(v.endsWith(".bpmn") ? v : `${v}.bpmn`);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <button
            className="chrome-btn max-w-[260px]"
            title="Rename diagram"
            onClick={() => setRenaming(true)}
          >
            <span className="truncate">{fileName}</span>
          </button>
        )}

        <span
          className="ml-1 flex items-center gap-1.5 text-[11.5px]"
          style={{ color: dirty ? "var(--warn)" : "var(--text-muted)" }}
        >
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: dirty ? "var(--warn)" : "var(--ok)" }}
          />
          {saveLabel}
        </span>

        <div className="flex-1" />

        <button
          className="chrome-btn"
          onClick={() => modelerRef.current?.get("commandStack").undo()}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo2 size={16} strokeWidth={1.5} />
        </button>
        <button
          className="chrome-btn"
          onClick={() => modelerRef.current?.get("commandStack").redo()}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <Redo2 size={16} strokeWidth={1.5} />
        </button>

        <div className="mx-1 h-5 w-px" style={{ background: "var(--border)" }} />

        <button
          className="chrome-btn"
          aria-pressed={showValidation}
          onClick={() => setShowValidation((v) => !v)}
          title="Validation findings"
        >
          {errors > 0 ? (
            <CircleAlert size={16} strokeWidth={1.5} style={{ color: "var(--danger)" }} />
          ) : warnings > 0 ? (
            <AlertTriangle size={16} strokeWidth={1.5} style={{ color: "var(--warn)" }} />
          ) : (
            <Check size={16} strokeWidth={1.5} style={{ color: "var(--ok)" }} />
          )}
          <span className="text-[12px] tabular-nums">
            {errors > 0 || warnings > 0 || hints > 0
              ? [
                  errors ? `${errors}` : null,
                  warnings ? `${warnings}` : null,
                  hints ? `${hints}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Valid"}
          </span>
        </button>

        <button
          className="chrome-btn"
          aria-pressed={gridOn}
          onClick={toggleGrid}
          title="Toggle grid snapping"
          aria-label="Toggle grid"
        >
          <Grid3x3 size={16} strokeWidth={1.5} />
        </button>

        <button
          className="chrome-btn"
          onClick={toggleTheme}
          title="Switch theme"
          aria-label="Switch color theme"
        >
          {theme === "dark" ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
        </button>

        <button
          className="chrome-btn"
          aria-pressed={panelOpen}
          onClick={() => setPanelOpen((v) => !v)}
          title="Toggle properties panel"
          aria-label="Toggle properties panel"
        >
          <PanelRight size={16} strokeWidth={1.5} />
        </button>

        <Menu
          align="right"
          trigger={({ toggle }) => (
            <button className="chrome-btn" onClick={toggle} aria-haspopup="menu">
              File
              <ChevronDown size={14} strokeWidth={1.5} />
            </button>
          )}
        >
          <button className="menu-item" onClick={newDiagram}>
            New diagram <span className="shortcut" />
          </button>
          <button className="menu-item" onClick={() => setDialog("templates")}>
            New from template
          </button>
          <button className="menu-item" onClick={openFile}>
            Open <span className="shortcut">Ctrl+O</span>
          </button>
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => save(false)}>
            Save <span className="shortcut">Ctrl+S</span>
          </button>
          <button className="menu-item" onClick={() => save(true)}>
            Save As <span className="shortcut">Ctrl+Shift+S</span>
          </button>
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => setDialog("export")}>
            Export and share
          </button>
          <button className="menu-item" onClick={() => setDialog("xml")}>
            View XML
          </button>
        </Menu>

        <Menu
          align="right"
          trigger={({ toggle }) => (
            <button className="chrome-btn" onClick={toggle} aria-haspopup="menu">
              Tools
              <ChevronDown size={14} strokeWidth={1.5} />
            </button>
          )}
        >
          <button className="menu-item" onClick={() => setDialog("steps")}>
            Process step list
          </button>
          <button className="menu-item" onClick={() => setDialog("docs")}>
            Documentation report
          </button>
          <button className="menu-item" onClick={() => setDialog("diff")}>
            Compare two files
          </button>
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => setDialog("shortcuts")}>
            Keyboard shortcuts <span className="shortcut">?</span>
          </button>
          <button className="menu-item" onClick={() => setDialog("cleardata")}>
            Clear local data
          </button>
        </Menu>
      </header>

      {/* ------------------------------ body ------------------------------ */}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <div
            ref={canvasRef}
            className={`canvas-host absolute inset-0 ${gridOn ? "grid-on" : ""}`}
          />

          {/* inline notices */}
          <div className="no-print pointer-events-none absolute left-1/2 top-3 z-40 w-full max-w-xl -translate-x-1/2 space-y-2 px-4">
            {staleTab && (
              <div className="pointer-events-auto">
                <Notice kind="warning" onDismiss={() => setStaleTab(false)}>
                  Another tab of BPMN Studio is editing too. Autosave keeps the most recent
                  change from either tab — the other tab's recovery copy may overwrite this one.
                </Notice>
              </div>
            )}
            {notices.map((n) => (
              <div key={n.id} className="pointer-events-auto">
                <Notice
                  kind={n.kind}
                  onDismiss={() => setNotices((prev) => prev.filter((x) => x.id !== n.id))}
                >
                  {n.text}
                </Notice>
              </div>
            ))}
          </div>

          {/* zoom controls */}
          <div
            className="zoom-controls absolute bottom-3 left-3 z-30 flex items-center gap-0.5 rounded-lg p-1"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-1)",
            }}
          >
            <button
              className="chrome-btn"
              onClick={() => setZoomLevel(zoom / 1.25)}
              aria-label="Zoom out"
              title="Zoom out (Ctrl+scroll)"
            >
              −
            </button>
            <button
              className="chrome-btn tabular-nums"
              style={{ minWidth: 52, justifyContent: "center" }}
              onClick={zoomFit}
              title="Zoom to fit"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              className="chrome-btn"
              onClick={() => setZoomLevel(zoom * 1.25)}
              aria-label="Zoom in"
              title="Zoom in (Ctrl+scroll)"
            >
              +
            </button>
          </div>

          {/* validation drawer */}
          {showValidation && (
            <ValidationDrawer
              findings={findings}
              onSelect={selectFinding}
              onClose={() => setShowValidation(false)}
            />
          )}

          {phase.kind === "loading" && (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center"
              style={{ background: "var(--canvas-bg)", color: "var(--text-muted)" }}
            >
              Preparing diagram
            </div>
          )}
        </div>

        {/* properties panel */}
        <aside
          className="props-panel relative flex shrink-0"
          style={{
            width: panelOpen ? panelWidth : 0,
            borderLeft: panelOpen ? "1px solid var(--border)" : "none",
            background: "var(--surface)",
            transition: resizing.current ? "none" : "width 150ms ease",
            overflow: "hidden",
          }}
          aria-label="Element properties"
          aria-hidden={!panelOpen}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize properties panel"
            tabIndex={0}
            className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-col-resize"
            onMouseDown={() => {
              resizing.current = true;
              document.body.style.cursor = "col-resize";
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setPanelWidth((w) => Math.min(560, w + 16));
              if (e.key === "ArrowRight") setPanelWidth((w) => Math.max(240, w - 16));
            }}
          />
          <div ref={propsRef} className="props-host w-full" />
        </aside>
      </div>

      {/* ------------------------------ dialogs ------------------------------ */}
      {phase.kind === "nodi" && (
        <NoDiDialog
          onLayout={async () => {
            try {
              const laid = await autoLayoutXml(phase.xml);
              setPhase({ kind: "loading" });
              await importXml(modelerRef.current, laid);
              pushNotice(
                "info",
                "The file had no diagram layout, so positions were generated automatically. Rearrange as needed — the process logic is untouched.",
              );
            } catch (err: any) {
              setPhase({ kind: "error", message: String(err?.message ?? err), raw: phase.xml });
            }
          }}
          onViewXml={() => setPhase({ kind: "error", message: "This file has no diagram layout section.", raw: phase.xml })}
          onCancel={onExit}
        />
      )}
      {phase.kind === "error" && (
        <ImportErrorDialog message={phase.message} raw={phase.raw} onClose={onExit} />
      )}
      {dialog === "export" && (
        <ExportDialog
          modeler={modelerRef.current}
          fileName={fileName}
          onNotice={pushNotice}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "steps" && (
        <StepListDialog modeler={modelerRef.current} fileName={fileName} onClose={() => setDialog(null)} />
      )}
      {dialog === "docs" && (
        <DocReportDialog modeler={modelerRef.current} fileName={fileName} onClose={() => setDialog(null)} />
      )}
      {dialog === "diff" && <DiffDialog modeler={modelerRef.current} onClose={() => setDialog(null)} />}
      {dialog === "xml" && <XmlDialog modeler={modelerRef.current} fileName={fileName} onClose={() => setDialog(null)} />}
      {dialog === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog === "cleardata" && (
        <ClearDataDialog
          onCleared={() => pushNotice("info", "All locally stored data was removed: autosave, recents, settings, and file permissions.")}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "templates" && (
        <TemplatesDialog
          onPick={(xml, name) => {
            if (dirtyRef.current && !window.confirm("You have unsaved changes. Start the template and discard them?")) {
              return;
            }
            onOpenDoc({ xml, name, handle: null, origin: "template" });
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "confirm-leave" && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body="The diagram has changes that are not saved to a file. Autosave keeps a recovery copy in this browser, but the file on disk is not updated."
          confirmLabel="Leave anyway"
          onConfirm={onExit}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "confirm-new" && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body="Starting a new diagram will discard changes that are not saved to a file."
          confirmLabel="New diagram"
          onConfirm={() =>
            onOpenDoc({ xml: BLANK_DIAGRAM, name: "Untitled diagram", handle: null, origin: "new" })
          }
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
