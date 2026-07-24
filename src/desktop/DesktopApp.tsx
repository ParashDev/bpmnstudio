import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceClass } from "../platform";
import { readShareFragment, decodeShareFragment } from "../export/share";
import { templateById, buildXml } from "../bpmn/templates";
import { BLANK_DIAGRAM } from "../bpmn/blank";
import { readDroppedFile } from "../files/fileAccess";
import { Landing } from "./Landing";
import { Editor, type DocInput } from "./Editor";
import { ReadOnlyView } from "./ReadOnlyView";

type View =
  | { kind: "landing"; notice?: string }
  | { kind: "editor"; doc: DocInput }
  | { kind: "readonly"; xml: string };

export default function DesktopApp({ device }: { device: DeviceClass }) {
  const [view, setView] = useState<View | null>(null);
  const dirtyRef = useRef(false);

  // Boot: shared fragment > template param > landing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fragment = readShareFragment();
      if (fragment) {
        try {
          const xml = await decodeShareFragment(fragment);
          if (!cancelled) setView({ kind: "readonly", xml });
          return;
        } catch {
          if (!cancelled) {
            history.replaceState(null, "", location.pathname);
            setView({
              kind: "landing",
              notice:
                "This share link could not be decoded — it may have been truncated in transit. Ask the sender for the .bpmn file instead.",
            });
          }
          return;
        }
      }
      const params = new URLSearchParams(location.search);
      const templateId = params.get("template");
      if (templateId) {
        const t = templateById(templateId);
        if (t) {
          history.replaceState(null, "", location.pathname);
          setView({
            kind: "editor",
            doc: { xml: buildXml(t), name: t.name, handle: null, origin: "template" },
          });
          return;
        }
      }
      if (!cancelled) setView({ kind: "landing" });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Crawlable content is visible on the landing view only.
  useEffect(() => {
    document.body.dataset.view = view?.kind === "landing" || view === null ? "landing" : "editor";
  }, [view]);

  const openDoc = useCallback((doc: DocInput) => {
    setView({ kind: "editor", doc });
  }, []);

  // Global drag-and-drop: opening a file works anywhere in the app.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (!/\.(bpmn|xml)$/i.test(file.name)) return;
      e.preventDefault();
      if (dirtyRef.current) {
        const ok = window.confirm(
          "You have unsaved changes. Open the dropped file and discard them?",
        );
        if (!ok) return;
      }
      const opened = await readDroppedFile(file);
      openDoc({ xml: opened.text, name: opened.name, handle: null, origin: "file" });
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [openDoc]);

  if (!view) return null;

  if (view.kind === "readonly") {
    return (
      <ReadOnlyView
        xml={view.xml}
        onEditCopy={() => {
          history.replaceState(null, "", location.pathname);
          openDoc({ xml: view.xml, name: "Shared diagram", handle: null, origin: "shared-copy" });
        }}
        onExit={() => {
          history.replaceState(null, "", location.pathname);
          setView({ kind: "landing" });
        }}
      />
    );
  }

  if (view.kind === "editor") {
    return (
      <Editor
        key={`${view.doc.name}-${view.doc.origin}-${view.doc.xml.length}`}
        doc={view.doc}
        device={device}
        dirtyRef={dirtyRef}
        onExit={() => {
          dirtyRef.current = false;
          setView({ kind: "landing" });
        }}
        onOpenDoc={openDoc}
      />
    );
  }

  return <Landing notice={view.notice} onOpenDoc={openDoc} />;
}
