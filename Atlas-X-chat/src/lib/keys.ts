import { useApp } from "@/store";

const INTERACTIVE =
  "input, textarea, select, button, a[href], summary, [role='slider'], [role='switch'], [role='tab'], [role='button'], [role='menuitem'], [contenteditable='true']";
const TEXTUAL = "input, textarea, select, [contenteditable='true'], [role='slider']";

/** Space/Enter would natively activate this element — don't hijack it. */
export function isInteractiveTarget(t: EventTarget | null) {
  return t instanceof Element && !!t.closest(INTERACTIVE);
}

/** Arrow keys belong to this element (text fields, sliders). */
export function isTextTarget(t: EventTarget | null) {
  return t instanceof Element && !!t.closest(TEXTUAL);
}

/** A modal surface is covering the page; page-level shortcuts must stay quiet. */
export function overlayOpen() {
  const s = useApp.getState();
  return s.paletteOpen || s.settingsOpen || !s.welcomeSeen || !!document.querySelector("[data-modal-open]");
}

export function safeSession(key: string, value?: string): string | null {
  try {
    if (value !== undefined) {
      sessionStorage.setItem(key, value);
      return value;
    }
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
