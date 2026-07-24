/**
 * Lightweight read-only viewer used by the mobile app and shared-link view.
 * NavigatedViewer ships pan/zoom navigation but no editing modules.
 */
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";

export function createViewer(container: HTMLElement): any {
  return new NavigatedViewer({ container } as any);
}
