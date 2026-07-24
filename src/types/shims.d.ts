/**
 * Type shims for bpmn.io packages that ship without their own declarations.
 * The modeler's service locator is stringly-typed anyway, so `any` at the
 * module boundary is the honest signature.
 */

declare module "bpmn-moddle" {
  export default class BpmnModdle {
    constructor(packages?: Record<string, unknown>);
    fromXML(xml: string): Promise<{ rootElement: any; warnings: any[] }>;
    toXML(element: any, options?: { format?: boolean }): Promise<{ xml?: string }>;
    create(type: string, attrs?: Record<string, unknown>): any;
  }
}

declare module "bpmn-js-properties-panel" {
  export const BpmnPropertiesPanelModule: any;
  export const BpmnPropertiesProviderModule: any;
}

declare module "diagram-js-minimap" {
  const minimapModule: any;
  export default minimapModule;
}
