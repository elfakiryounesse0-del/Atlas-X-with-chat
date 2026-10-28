import { flushSync } from "react-dom";
import { create } from "zustand";
import { useApp } from "@/store";

/**
 * Morph engine
 * ------------
 * Shared-element transitions in Framer Motion only register a `layoutId` when
 * an element *mounts*. Toggling a layoutId on an already-mounted element (or
 * giving one to a `display:none` element) produces stale or corner-origin
 * morphs. To make every opening animation reliable we never morph *from* the
 * live source element. Instead we:
 *
 *   1. measure the source element,
 *   2. mount a fresh fixed-position "ghost" (copy) at exactly that rect,
 *      carrying the destination's layoutId,
 *   3. wait two frames so the ghost is registered, then open the destination.
 *
 * The destination mounts with the same layoutId and Framer animates from the
 * ghost. The source element is hidden while its ghost is in flight, so it
 * looks like the source itself became the destination.
 */

export const PALETTE_MORPH_ID = "palette-shell";
export const stageId = (placeId: string) => `stage-${placeId}`;

export type Radius = number | [number, number, number, number];

export interface Ghost {
  id: number;
  target: string;
  source: string;
  rect: { x: number; y: number; width: number; height: number };
  radius: Radius;
  kind: "image" | "glass";
  src?: string;
  /** Keep the ghost alive until explicitly cleared (enables a return morph). */
  persist?: boolean;
}

/**
 * `pulse` is bumped in the same synchronous commit that opens the destination,
 * forcing the ghost to re-render so Framer snapshots it right before the
 * destination mounts — works for store navigation *and* local component state.
 */
export const useMorph = create<{ ghost: Ghost | null; pulse: number }>(() => ({ ghost: null, pulse: 0 }));

let seq = 1;
let clearTimer: number | undefined;

function prefersReducedMotion() {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  } catch {
    /* noop */
  }
  return useApp.getState().settings.reduceMotion;
}

export interface MorphOptions {
  target: string;
  source: string;
  radius?: Radius;
  kind?: Ghost["kind"];
  src?: string;
  persist?: boolean;
}

export function launchMorph(el: Element | null | undefined, opts: MorphOptions, then: () => void) {
  const r = el?.getBoundingClientRect();
  // Hidden / zero-size / off-screen sources and reduced motion: no morph.
  const visible =
    !!r && r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
  if (!visible || prefersReducedMotion()) {
    then();
    return;
  }
  window.clearTimeout(clearTimer);
  const id = seq++;
  useMorph.setState({
    ghost: {
      id,
      target: opts.target,
      source: opts.source,
      rect: { x: r!.left, y: r!.top, width: r!.width, height: r!.height },
      radius: opts.radius ?? 20,
      kind: opts.kind ?? "image",
      src: opts.src,
      persist: opts.persist,
    },
  });
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      // One synchronous commit: ghost snapshots, destination mounts and resumes from it.
      flushSync(() => {
        useMorph.setState((s) => ({ pulse: s.pulse + 1 }));
        then();
      });
      // Non-persistent ghosts retire once the destination has taken over.
      // Persistent ones get a safety net in case the destination never opened.
      clearTimer = window.setTimeout(() => {
        const g = useMorph.getState().ghost;
        if (!g || g.id !== id) return;
        if (!g.persist || !useApp.getState().paletteOpen) clearMorph(id);
      }, 1500);
    })
  );
}

export function clearMorph(id?: number) {
  const g = useMorph.getState().ghost;
  if (g && (id === undefined || g.id === id)) useMorph.setState({ ghost: null });
}

/** Clears the ghost for a target after a delay, letting a return morph land. */
export function retireMorph(target: string, delay = 520) {
  const g = useMorph.getState().ghost;
  if (!g || g.target !== target) return;
  const id = g.id;
  window.setTimeout(() => clearMorph(id), delay);
}

/** True while `key` is the element that launched the current ghost. */
export const useIsMorphSource = (key: string) => useMorph((s) => s.ghost?.source === key);

export const paletteMorph = (source: string, radius: Radius): MorphOptions => ({
  target: PALETTE_MORPH_ID,
  source,
  radius,
  kind: "glass",
  persist: true,
});
