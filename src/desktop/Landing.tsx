import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Circle,
  Diamond,
  FilePlus2,
  FolderOpen,
  HardDrive,
  History,
  Image,
  Menu as MenuIcon,
  MousePointer2,
  ShieldCheck,
  Square,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { templates, buildXml, thumbnailSvg } from "../bpmn/templates";
import { BLANK_DIAGRAM } from "../bpmn/blank";
import { openFilePicker } from "../files/fileAccess";
import {
  AutosaveRecord,
  RecentRecord,
  clearAutosave,
  listRecents,
  readAutosave,
  removeRecent,
  storageAvailable,
} from "../storage/db";
import { env } from "../env";
import { Notice } from "../ui/Notice";
import type { DocInput } from "./Editor";

const heroTemplate = templates.find((t) => t.id === "approval") ?? templates[0];
const heroSvg = thumbnailSvg(heroTemplate, "ap_mgr");

function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#0d9488" />
      <circle cx="9" cy="16" r="3.4" fill="none" stroke="#fff" strokeWidth="1.8" />
      <path d="M 12.4 16 L 16.4 16" stroke="#fff" strokeWidth="1.8" />
      <path
        d="M 21.5 10.8 L 26 16 L 21.5 21.2 L 17 16 Z"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Landing({
  notice,
  onOpenDoc,
  viewOnly = false,
}: {
  notice?: string;
  onOpenDoc: (doc: DocInput) => void;
  /** phones: same landing, but every action opens the viewer, not the editor */
  viewOnly?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [recents, setRecents] = useState<RecentRecord[]>([]);
  const [recovery, setRecovery] = useState<AutosaveRecord | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const [bootNotice, setBootNotice] = useState<string | undefined>(notice);

  useEffect(() => {
    storageAvailable().then(setStorageOk);
    listRecents().then(setRecents);
    readAutosave().then((rec) => rec && setRecovery(rec));
  }, []);

  // Lock page scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const newDiagram = () =>
    onOpenDoc({ xml: BLANK_DIAGRAM, name: "Untitled diagram", handle: null, origin: "new" });

  const open = async () => {
    const file = await openFilePicker();
    if (!file) return;
    onOpenDoc({ xml: file.text, name: file.name, handle: file.handle, origin: "file" });
  };

  return (
    <div className="landing min-h-screen" style={{ background: "var(--bg)" }}>
      {/* -------------------------------- nav -------------------------------- */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: "color-mix(in srgb, var(--bg) 86%, transparent)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          className="mx-auto flex h-[60px] max-w-6xl items-center justify-between px-6"
          style={{
            paddingLeft: "max(1.5rem, env(safe-area-inset-left))",
            paddingRight: "max(1.5rem, env(safe-area-inset-right))",
          }}
        >
          <span className="flex items-center gap-2.5">
            <LogoMark />
            <span className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              BPMN Studio
            </span>
          </span>
          <nav className="hidden items-center gap-7 text-[13px] md:flex" aria-label="Guides">
            <a className="landing-nav-link" href="/bpmn-symbols/">Symbols</a>
            <a className="landing-nav-link" href="/bpmn-tutorial/">Tutorial</a>
            <a className="landing-nav-link" href="/bpmn-vs-flowchart/">BPMN vs flowchart</a>
            <a className="landing-nav-link" href="/bpmn-examples/">Examples</a>
            <a className="landing-nav-link" href="/how-it-works/">How it works</a>
          </nav>
          <span className="flex items-center gap-2">
            <button
              className="primary-btn header-open-editor"
              style={{ height: 34 }}
              onClick={newDiagram}
            >
              Open editor
            </button>
            <button
              className="flex h-[38px] w-[38px] items-center justify-center rounded-lg md:hidden"
              style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label="Toggle navigation menu"
            >
              {menuOpen ? <X size={19} strokeWidth={1.8} /> : <MenuIcon size={19} strokeWidth={1.8} />}
            </button>
          </span>
        </div>
      </header>

        {/* small screens: slide-in navigation drawer */}
        {menuOpen && (
          <div className="md:hidden">
            <div className="mobile-nav-backdrop" onClick={() => setMenuOpen(false)} />
            <nav className="mobile-nav-drawer" aria-label="Guides">
              <div className="drawer-head">
                <span className="flex items-center gap-2.5">
                  <LogoMark size={20} />
                  <span className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                    BPMN Studio
                  </span>
                </span>
                <button
                  className="flex h-[36px] w-[36px] items-center justify-center rounded-lg"
                  style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                >
                  <X size={18} strokeWidth={1.8} />
                </button>
              </div>
              <div className="drawer-links">
                {[
                  ["/bpmn-symbols/", "Symbols"],
                  ["/bpmn-tutorial/", "Tutorial"],
                  ["/bpmn-vs-flowchart/", "BPMN vs flowchart"],
                  ["/bpmn-examples/", "Examples"],
                  ["/how-it-works/", "How it works"],
                ].map(([href, label]) => (
                  <a key={href} href={href}>
                    {label}
                  </a>
                ))}
              </div>
              <a className="drawer-foot" href="https://www.dplooy.com">
                Dplooy
              </a>
            </nav>
          </div>
        )}

      <main>
        {/* -------------------------------- hero -------------------------------- */}
        <section className="mx-auto max-w-6xl px-6 pt-20 text-center lg:pt-24">
          <p
            className="fade-up mx-auto mb-6 inline-flex items-center gap-2 rounded-full py-1 pl-1.5 pr-3.5 text-[12px] font-medium"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              background: "var(--surface)",
            }}
          >
            <span
              className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              Free
            </span>
            No signup · No uploads · No feature gates
          </p>

          <h1
            className="fade-up fade-d1 mx-auto m-0 max-w-3xl text-[44px] font-semibold leading-[1.06] tracking-[-0.025em] sm:text-[56px]"
            style={{ color: "var(--text)" }}
          >
            Serious BPMN modeling,
            <br />
            <span style={{ color: "var(--accent)" }}>right in your browser</span>
          </h1>

          <p
            className="fade-up fade-d2 mx-auto mt-6 max-w-xl text-[16px] leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            The complete BPMN 2.0 element set, live validation that understands process logic,
            and clean exports — with every diagram staying on your own device.
          </p>

          <div className="fade-up fade-d3 mt-9 flex flex-wrap items-center justify-center gap-3">
            <button
              className="primary-btn"
              style={{ height: 44, paddingInline: 24, fontSize: 14.5, opacity: viewOnly ? 0.5 : 1 }}
              onClick={newDiagram}
              disabled={viewOnly}
              title={viewOnly ? "Editing needs a larger screen" : undefined}
            >
              <FilePlus2 size={17} strokeWidth={1.5} />
              Start modeling
            </button>
            <button
              className="secondary-btn"
              style={{ height: 44, paddingInline: 24, fontSize: 14.5 }}
              onClick={open}
            >
              <FolderOpen size={17} strokeWidth={1.5} />
              Open a file
            </button>
          </div>
          <p className="fade-up fade-d3 mt-4 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            {viewOnly
              ? "This device gets the full viewer — inspect, validate, export. Editing needs a larger screen."
              : "or drop a .bpmn file anywhere on this page — it opens instantly, locally"}
          </p>
        </section>

        {/* --------------------------- editor mockup --------------------------- */}
        <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
          <div className="mockup fade-up fade-d4 mx-auto" aria-hidden="true">
            {/* window chrome */}
            <div
              className="flex items-center gap-2 px-4"
              style={{ height: 40, borderBottom: "1px solid var(--border)" }}
            >
              <span className="flex gap-1.5">
                {["#f0605f", "#f5bd4f", "#61c454"].map((c) => (
                  <span key={c} className="h-[11px] w-[11px] rounded-full" style={{ background: c, opacity: 0.9 }} />
                ))}
              </span>
              <span
                className="ml-3 flex items-center gap-2 rounded-md px-2.5 py-1 text-[11.5px] font-medium"
                style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}
              >
                approval-chain.bpmn
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--ok)" }} />
              </span>
              <span
                className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                <Check size={12} strokeWidth={2.5} />
                Valid — 0 errors
              </span>
              <span className="hidden text-[11.5px] tabular-nums sm:block" style={{ color: "var(--text-muted)" }}>
                100%
              </span>
            </div>

            <div className="flex" style={{ height: 420 }}>
              {/* palette */}
              <div
                className="hidden w-[52px] shrink-0 flex-col items-center gap-1 py-3 sm:flex"
                style={{ borderRight: "1px solid var(--border)" }}
              >
                {[MousePointer2, Circle, Square, Diamond].map((Icon, i) => (
                  <span
                    key={i}
                    className="flex h-9 w-9 items-center justify-center rounded-md"
                    style={
                      i === 0
                        ? { background: "var(--accent-soft)", color: "var(--accent)" }
                        : { color: "var(--text-muted)" }
                    }
                  >
                    <Icon size={17} strokeWidth={1.5} />
                  </span>
                ))}
                <span className="mx-auto my-1 h-px w-6" style={{ background: "var(--border)" }} />
                {[Circle, Square].map((Icon, i) => (
                  <span key={i} className="flex h-9 w-9 items-center justify-center rounded-md" style={{ color: "var(--text-muted)" }}>
                    <Icon size={17} strokeWidth={1.5} style={{ transform: i ? "rotate(45deg)" : undefined }} />
                  </span>
                ))}
              </div>

              {/* canvas */}
              <div
                className="hero-canvas relative min-w-0 flex-1 p-6"
                style={{
                  backgroundImage: "radial-gradient(circle, var(--grid-dot) 1px, transparent 1px)",
                  backgroundSize: "18px 18px",
                  color: "#3f3f46",
                }}
              >
                <div
                  className="flex h-full items-center justify-center"
                  dangerouslySetInnerHTML={{ __html: heroSvg }}
                />
                <span
                  className="absolute bottom-4 left-4 hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] sm:flex"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                    boxShadow: "var(--shadow-1)",
                  }}
                >
                  − <span className="tabular-nums">100%</span> +
                </span>
              </div>

              {/* properties panel */}
              <div
                className="hidden w-[230px] shrink-0 flex-col gap-4 p-4 lg:flex"
                style={{ borderLeft: "1px solid var(--border)" }}
              >
                <div
                  className="flex items-center gap-2 pb-3 text-[12.5px] font-semibold"
                  style={{ borderBottom: "1px solid var(--border)", color: "var(--text)" }}
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded"
                    style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                  >
                    <Square size={13} strokeWidth={1.5} />
                  </span>
                  Manager review
                </div>
                <div>
                  <div className="mockup-label">Name</div>
                  <div className="mockup-field">Manager review</div>
                </div>
                <div>
                  <div className="mockup-label">Type</div>
                  <div className="mockup-field">User task</div>
                </div>
                <div>
                  <div className="mockup-label">Documentation</div>
                  <div className="mockup-field" style={{ height: 64, color: "var(--text-secondary)" }}>
                    Line manager approves or rejects the request within 48 hours.
                  </div>
                </div>
                <div className="mt-auto text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  Autosaved locally · Nothing uploaded
                </div>
              </div>
            </div>
          </div>

          {/* trust strip */}
          <ul
            className="fade-up fade-d5 mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-x-8 gap-y-2 p-0 text-[13px]"
            style={{ listStyle: "none", color: "var(--text-secondary)" }}
          >
            {[
              "BPMN 2.0 compliant",
              "Opens Camunda and Signavio files",
              "Works offline",
              "100% local — zero servers",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check size={14} strokeWidth={2.25} style={{ color: "var(--accent)" }} />
                {t}
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------ notices ------------------------------ */}
        <div className="mx-auto mt-10 max-w-2xl space-y-2 px-6">
          {bootNotice && (
            <Notice kind="error" onDismiss={() => setBootNotice(undefined)}>
              {bootNotice}
            </Notice>
          )}
          {!storageOk && (
            <Notice kind="warning">
              Local storage is unavailable in this browser session (often private browsing), so
              autosave and the recents list are off. Saving to a file still works normally.
            </Notice>
          )}
          {!env.secure && (
            <Notice kind="info">
              This page is not served over HTTPS, so saving directly back to a file and system
              share are unavailable. Saving falls back to downloads.
            </Notice>
          )}
          {recovery && (
            <Notice
              kind="info"
              actions={
                <span className="flex shrink-0 gap-2">
                  <button
                    className="chrome-btn"
                    style={{ color: "var(--accent)" }}
                    onClick={() =>
                      onOpenDoc({ xml: recovery.xml, name: recovery.name, handle: null, origin: "recovered" })
                    }
                  >
                    <History size={14} strokeWidth={1.5} />
                    Restore
                  </button>
                  <button
                    className="chrome-btn"
                    onClick={() => {
                      clearAutosave();
                      setRecovery(null);
                    }}
                  >
                    Discard
                  </button>
                </span>
              }
            >
              Unsaved work from {new Date(recovery.savedAt).toLocaleString()} was recovered:{" "}
              <strong>{recovery.name}</strong>
            </Notice>
          )}
        </div>

        {/* ------------------------------ recents ------------------------------ */}
        {recents.length > 0 && (
          <section className="mx-auto max-w-6xl px-6 pt-20">
            <div className="mb-5 flex items-baseline justify-between">
              <h2 className="m-0 text-[20px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                Recent diagrams
              </h2>
              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                stored only in this browser
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {recents.map((r) => (
                <div key={r.id} className="group relative">
                  <button
                    className="card-hover w-full overflow-hidden rounded-xl text-left"
                    style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
                    onClick={() => onOpenDoc({ xml: r.xml, name: r.name, handle: null, origin: "recent" })}
                  >
                    <div
                      className="flex h-28 items-center justify-center overflow-hidden p-3"
                      style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}
                    >
                      {r.thumb ? (
                        <img
                          alt=""
                          className="max-h-full max-w-full"
                          style={{ filter: "var(--thumb-filter, none)" }}
                          src={`data:image/svg+xml;utf8,${encodeURIComponent(r.thumb)}`}
                        />
                      ) : (
                        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          No preview
                        </span>
                      )}
                    </div>
                    <div className="px-3.5 py-2.5">
                      <div className="truncate text-[12.5px] font-medium" style={{ color: "var(--text)" }}>
                        {r.name}
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {new Date(r.openedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </button>
                  <button
                    aria-label={`Remove ${r.name} from recents`}
                    className="absolute right-2 top-2 hidden rounded-md p-1 group-hover:block"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
                    onClick={() => {
                      removeRecent(r.id);
                      setRecents((prev) => prev.filter((x) => x.id !== r.id));
                    }}
                  >
                    <Trash2 size={13} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ------------------------------ features ------------------------------ */}
        <section className="mx-auto max-w-6xl px-6 pt-24">
          <p className="section-label m-0">Why this one</p>
          <h2
            className="mb-8 mt-2 max-w-xl text-[26px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--text)" }}
          >
            A modeling tool, not a drawing tool
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: ShieldCheck,
                title: "Validation that understands BPMN",
                body: "Deadlocking gateways, missing conditions, unreachable steps, pool-boundary mistakes — caught as you draw and explained in plain language, one click from the element.",
              },
              {
                icon: HardDrive,
                title: "Your files stay yours",
                body: "Open from disk, save back to disk. Autosave lives in your browser. No accounts, no telemetry, no server — verify it in the network tab.",
              },
              {
                icon: Image,
                title: "Exports people can use",
                body: "Clean BPMN 2.0 XML, SVG, and PNG up to 3x — plus a numbered step list of the whole process, ready to paste into a requirements document.",
              },
              {
                icon: WifiOff,
                title: "Works offline",
                body: "Cached after your first visit; runs with no connection at all. Model on a plane — nothing about this tool needs the internet.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-xl p-5"
                style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
              >
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  <f.icon size={18} strokeWidth={1.5} />
                </span>
                <h3 className="mb-1.5 mt-3.5 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                  {f.title}
                </h3>
                <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------ templates ------------------------------ */}
        <section className="mx-auto max-w-6xl px-6 pt-24">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="section-label m-0">Templates</p>
              <h2 className="m-0 mt-2 text-[26px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                Start from a real process
              </h2>
            </div>
            <a
              className="flex items-center gap-1 text-[13px] font-medium"
              style={{ color: "var(--accent)" }}
              href="/bpmn-examples/"
            >
              What each one teaches
              <ArrowRight size={14} strokeWidth={1.5} />
            </a>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <button
                key={t.id}
                className="card-hover overflow-hidden rounded-xl text-left"
                style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
                onClick={() => onOpenDoc({ xml: buildXml(t), name: t.name, handle: null, origin: "template" })}
              >
                <div
                  className="tpl-thumb flex h-32 items-center justify-center p-4"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                    backgroundImage: "radial-gradient(circle, var(--grid-dot) 1px, transparent 1px)",
                    backgroundSize: "16px 16px",
                  }}
                  dangerouslySetInnerHTML={{ __html: thumbnailSvg(t) }}
                />
                <div className="px-4 py-3">
                  <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                    {t.name}
                  </div>
                  <div className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {t.tagline}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ------------------------------ about ------------------------------ */}
        <section className="mx-auto max-w-6xl px-6 pt-24">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <p className="section-label m-0">The notation</p>
              <h2 className="m-0 mt-2 text-[26px] font-semibold leading-tight tracking-tight" style={{ color: "var(--text)" }}>
                What is BPMN 2.0?
              </h2>
              <p className="mt-4 text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Business Process Model and Notation is the ISO-standardized language for describing
                how work actually flows. Unlike a freeform flowchart, every shape has a defined
                meaning — which is why the same file opens here, in Camunda, in Signavio, or in an
                engine that executes it directly.
              </p>
              <a
                className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium"
                style={{ color: "var(--accent)" }}
                href="/bpmn-symbols/"
              >
                Complete symbol reference
                <ArrowRight size={14} strokeWidth={1.5} />
              </a>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { term: "Events", shape: "circles", body: "Things that happen: a process starting, a timer expiring, a message arriving, an error being thrown." },
                { term: "Activities", shape: "rounded rectangles", body: "Work being done — by a person, a system, or a business rule." },
                { term: "Gateways", shape: "diamonds", body: "Where flow splits and joins: exclusive picks one path, parallel takes all, inclusive takes every path whose condition holds." },
                { term: "Pools and lanes", shape: "containers", body: "Who is responsible for each step — and message flows show communication crossing organizational boundaries." },
              ].map((x) => (
                <div key={x.term} className="rounded-xl p-4" style={{ border: "1px solid var(--border)" }}>
                  <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                    {x.term}{" "}
                    <span className="font-normal" style={{ color: "var(--text-muted)" }}>
                      — {x.shape}
                    </span>
                  </div>
                  <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {x.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------ FAQ ------------------------------ */}
        <section className="mx-auto max-w-6xl px-6 pt-24">
          <p className="section-label m-0">FAQ</p>
          <h2 className="m-0 mt-2 text-[26px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
            Frequently asked questions
          </h2>
          <div className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {[
              ["Is it free?", "Completely. Every feature is available to everyone — no paid tier, no trial, no feature gates, no ads."],
              ["Is there a signup?", "No. There are no accounts. Open the page and start modeling."],
              ["Are my files uploaded anywhere?", "No — there is no server to upload to. Diagrams stay on your disk, and autosave lives in your browser's local storage, which you can clear at any time."],
              ["Can I open Camunda files?", "Yes. Files from Camunda Modeler, Zeebe, Signavio, Bizagi, and ARIS open normally, and their vendor-specific attributes are preserved when you save."],
              ["Does it export to PNG?", "Yes — PNG at 1x, 2x, or 3x with transparent or solid background, plus SVG and clean, formatted BPMN 2.0 XML."],
              ["Does it work offline?", "Yes. After the first visit the app is cached locally and works with no connection at all."],
              ["Can I use it on my phone?", "Phones get a viewer: open, inspect, validate, and export. Editing needs a larger screen — precise drag-and-drop doesn't work at phone size."],
              ["Is it BPMN 2.0 compliant?", "Yes. It reads and writes standard BPMN 2.0 XML with diagram interchange, covering the full element set."],
            ].map(([q, a]) => (
              <div key={q}>
                <h3 className="m-0 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                  {q}
                </h3>
                <p className="m-0 mt-1.5 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------ final CTA ------------------------------ */}
        <section className="mx-auto max-w-6xl px-6 pt-24 pb-8">
          <div
            className="rounded-2xl px-8 py-14 text-center"
            style={{ border: "1px solid var(--border)", background: "var(--surface-2)" }}
          >
            <h2 className="m-0 text-[28px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              Your next process diagram, in the next minute
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[14px]" style={{ color: "var(--text-secondary)" }}>
              No account to create, nothing to install, nothing uploaded. Open the editor and
              start drawing.
            </p>
            <button
              className="primary-btn mx-auto mt-7"
              style={{ height: 44, paddingInline: 26, fontSize: 14.5, opacity: viewOnly ? 0.5 : 1 }}
              onClick={newDiagram}
              disabled={viewOnly}
              title={viewOnly ? "Editing needs a larger screen" : undefined}
            >
              <FilePlus2 size={17} strokeWidth={1.5} />
              New diagram
            </button>
          </div>
        </section>

        <footer
          className="mx-auto flex max-w-6xl items-center justify-between px-6 pb-10 pt-4 text-[12px]"
          style={{ color: "var(--text-muted)" }}
        >
          <span className="flex items-center gap-2">
            <LogoMark size={16} />
            BPMN Studio — free, local-first, BPMN 2.0
          </span>
          <a href="https://www.dplooy.com" className="hover:underline" style={{ color: "var(--text-muted)" }}>
            Dplooy
          </a>
        </footer>
      </main>
    </div>
  );
}
