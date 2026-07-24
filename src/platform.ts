/**
 * Device classing. Phones get the read-only viewer; tablets and desktops get
 * the full modeler (tablets with enlarged hit targets).
 */

export type DeviceClass = "phone" | "tablet" | "desktop";

export function detectDevice(): DeviceClass {
  const coarse = window.matchMedia("(pointer: coarse)").matches;

  if (!coarse) return "desktop";
  if (window.innerWidth >= 1024) return "tablet";
  return "phone";
}

export function isTouch(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}
