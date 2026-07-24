/**
 * Modeler factory: bpmn-js Modeler plus minimap, properties panel, and small
 * custom modules for space-drag panning and cross-tab copy/paste.
 */
import BpmnModeler from "bpmn-js/lib/Modeler";
import {
  BpmnPropertiesPanelModule,
  BpmnPropertiesProviderModule,
} from "bpmn-js-properties-panel";
import minimapModule from "diagram-js-minimap";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";
import "@bpmn-io/properties-panel/dist/assets/properties-panel.css";
import "diagram-js-minimap/assets/diagram-js-minimap.css";

const CLIPBOARD_KEY = "bpmn-modeler:clipboard";

/** Hold Space to pan with the hand tool, matching Camunda Modeler. */
function SpacePan(this: any, eventBus: any, handTool: any) {
  let active = false;

  const isTypingTarget = (el: EventTarget | null) => {
    const node = el as HTMLElement | null;
    if (!node) return false;
    const tag = node.tagName;
    return (
      tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable
    );
  };

  const down = (event: KeyboardEvent) => {
    if (event.code !== "Space" || event.repeat || active || isTypingTarget(event.target)) return;
    active = true;
    try {
      if (!handTool.isActive()) handTool.toggle();
    } catch {
      /* tool activation is best-effort */
    }
  };

  const up = (event: KeyboardEvent) => {
    if (event.code !== "Space" || !active) return;
    active = false;
    try {
      if (handTool.isActive()) handTool.toggle();
    } catch {
      /* ignore */
    }
  };

  document.addEventListener("keydown", down);
  document.addEventListener("keyup", up);
  eventBus.on("diagram.destroy", () => {
    document.removeEventListener("keydown", down);
    document.removeEventListener("keyup", up);
  });
}
(SpacePan as any).$inject = ["eventBus", "handTool"];

const spacePanModule = {
  __init__: ["spacePan"],
  spacePan: ["type", SpacePan],
};

/**
 * Cross-tab clipboard: copied elements are mirrored to localStorage as JSON;
 * on window focus the newest external clipboard is revived into this tab's
 * clipboard so paste works across two tabs of the app.
 */
function CrossTabClipboard(this: any, eventBus: any, clipboard: any, moddle: any) {
  let lastWritten = "";

  eventBus.on("copyPaste.elementsCopied", (event: any) => {
    try {
      const serialized = JSON.stringify(event.tree);
      lastWritten = serialized;
      localStorage.setItem(CLIPBOARD_KEY, serialized);
    } catch {
      /* clipboard mirroring is best-effort (quota, private mode) */
    }
  });

  const createReviver = () => {
    const cache: Record<string, any> = {};
    return (_key: string, object: any) => {
      if (object && typeof object === "object" && typeof object.$type === "string") {
        if (object.id && cache[object.id]) return cache[object.id];
        const { $type, ...attrs } = object;
        const el = moddle.create($type, attrs);
        if (object.id) cache[object.id] = el;
        return el;
      }
      return object;
    };
  };

  const restore = () => {
    try {
      const raw = localStorage.getItem(CLIPBOARD_KEY);
      if (!raw || raw === lastWritten) return;
      lastWritten = raw;
      clipboard.set(JSON.parse(raw, createReviver()));
    } catch {
      /* unparseable external clipboard — ignore */
    }
  };

  window.addEventListener("focus", restore);
  eventBus.on("diagram.destroy", () => window.removeEventListener("focus", restore));
}
(CrossTabClipboard as any).$inject = ["eventBus", "clipboard", "moddle"];

const crossTabClipboardModule = {
  __init__: ["crossTabClipboard"],
  crossTabClipboard: ["type", CrossTabClipboard],
};

export interface CreateModelerOptions {
  container: HTMLElement;
  propertiesParent: HTMLElement;
}

export function createModeler({ container, propertiesParent }: CreateModelerOptions): any {
  return new BpmnModeler({
    container,
    propertiesPanel: { parent: propertiesParent },
    additionalModules: [
      BpmnPropertiesPanelModule,
      BpmnPropertiesProviderModule,
      minimapModule,
      spacePanModule,
      crossTabClipboardModule,
    ],
    minimap: { open: true },
  } as any);
}

/** Duplicate the current selection with a small offset (Ctrl+D). */
export function duplicateSelection(modeler: any) {
  try {
    const selection = modeler.get("selection");
    const copyPaste = modeler.get("copyPaste");
    const elements = selection.get();
    if (!elements.length) return;
    const parent = elements[0].parent;
    copyPaste.copy(elements);
    const bounds = getBounds(elements);
    const pasted = copyPaste.paste({
      element: parent,
      point: { x: bounds.cx + 40, y: bounds.cy + 40 },
    });
    if (pasted?.length) selection.select(pasted);
  } catch {
    /* duplication is a convenience; a failed paste leaves the diagram intact */
  }
}

function getBounds(elements: any[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const x = el.x ?? 0;
    const y = el.y ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + (el.width ?? 0));
    maxY = Math.max(maxY, y + (el.height ?? 0));
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}
