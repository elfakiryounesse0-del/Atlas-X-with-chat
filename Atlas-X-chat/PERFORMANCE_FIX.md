# Lag fixes

## 1. Earth globe (src/components/GlobeCSS.tsx, rewritten)
- Orbits/satellites drawn on small canvases (was SVG animateMotion + drop-shadow filters).
- Cheap gradients instead of 140px blurred box-shadows; GPU-promoted rotating texture; pauses off-screen.
- Bundled realistic Earth (src/assets/earth-fallback.jpg, with swirling clouds, varied land tones and a thin atmosphere limb) shown instantly; live NASA imagery replaces it when decoded.

## 2. Animated blur removed everywhere
Animated `filter: blur()` was running on whole pages, every card (shared `fadeUp` variant), the splash,
the welcome panel, images, top bar, tab bar, dynamic island, command palette, Explore and Timelapse.
Opacity/position/scale animations remain (they stay on the GPU).

## 3. Welcome screen
- Full-screen backdrop blur removed; drifting background blobs paused while it is open.

## 4. Map (src/components/MapView.tsx)
- The WebGL globe now starts only when Explore opens (or a few seconds after the welcome, when idle).
- Render resolution capped at 1.5x device pixel ratio (1x in lite mode).

## 5. Adaptive lite mode (src/lib/perf.ts + end of src/index.css)
- Measures the real frame rate ~1 s after launch. If it is low, adds `html.perf-lite`: solid glass instead of
  backdrop blur, no drifting blobs, no big shadows.
- Force lite:  http://localhost:5173/?lite=1      Force the full look:  ?lite=0   (both are remembered)

## Restore the old look
- Re-add `filter: "blur(...)"` to animation props (costs performance).
