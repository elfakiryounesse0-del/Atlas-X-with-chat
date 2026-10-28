/**
 * Adaptive performance guard.
 *
 * Glass blur (backdrop-filter), big shadows and drifting background blobs are the most expensive
 * effects in the app. On slower GPUs / laptops they can drop the frame rate. This guard measures the
 * real frame rate shortly after launch and, if it is low, switches the whole app to a "lite" look
 * (`html.perf-lite`, see index.css): solid glass instead of blur, no drifting blobs, no big shadows.
 *
 * Manual control:  ?lite=1  forces lite mode (remembered)   ?lite=0  forces the full look (remembered)
 */
const KEY = "epoch-lite";

const read = (store: Storage | undefined, k: string) => {
  try {
    return store?.getItem(k) ?? null;
  } catch {
    return null;
  }
};
const write = (store: Storage | undefined, k: string, v: string | null) => {
  try {
    if (v === null) store?.removeItem(k);
    else store?.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

export function initPerfGuard() {
  const root = document.documentElement;
  const enable = () => root.classList.add("perf-lite");

  const q = new URLSearchParams(window.location.search).get("lite");
  if (q === "1") write(window.localStorage, KEY, "1");
  if (q === "0") write(window.localStorage, KEY, "0");

  const pref = read(window.localStorage, KEY);
  if (pref === "1" || read(window.sessionStorage, KEY) === "1") {
    enable();
    return;
  }
  if (pref === "0") return; // user explicitly wants the full look

  // Measure real frame times for ~3.5 s, after the first second of start-up work.
  const t0 = performance.now() + 1000;
  let start = 0;
  let last = 0;
  let frames = 0;
  let slow = 0;
  const tick = (t: number) => {
    if (document.hidden) {
      start = 0; // restart the measurement when the tab comes back
      requestAnimationFrame(tick);
      return;
    }
    if (t < t0) {
      requestAnimationFrame(tick);
      return;
    }
    if (!start) {
      start = last = t;
      requestAnimationFrame(tick);
      return;
    }
    const dt = t - last;
    last = t;
    frames++;
    if (dt > 40) slow++;
    if (t - start >= 3500) {
      const fps = frames / ((t - start) / 1000);
      if (fps < 42 || slow / frames > 0.3) {
        enable();
        write(window.sessionStorage, KEY, "1");
      }
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
