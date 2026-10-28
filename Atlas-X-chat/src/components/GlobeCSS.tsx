import { useEffect, useMemo, useRef, useState } from "react";
import { globeTextureUrl } from "@/lib/gibs";
import earthFallback from "@/assets/earth-fallback.jpg";

const preload = (src: string) =>
  new Promise<boolean>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
    if (typeof img.decode === "function") img.decode().then(() => resolve(true), () => resolve(false));
  });

interface OrbitDef {
  rx: number;
  ry: number;
  rot: number;
  dur: number;
  begin: number;
  color: string;
  label: string;
}

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/**
 * Orbits + satellites are drawn on a tiny canvas instead of SVG `animateMotion` + `drop-shadow`
 * filters. SMIL animations re-rasterise the whole SVG (and its filter) on the main thread every
 * frame, which is what made the globe stutter when it appeared.
 */
function drawLayer(ctx: CanvasRenderingContext2D, which: "back" | "front", W: number, H: number, orbits: OrbitDef[], t: number) {
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H / 2;
  for (const o of orbits) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((o.rot * Math.PI) / 180);

    // orbit path
    ctx.beginPath();
    if (which === "front") {
      ctx.ellipse(0, 0, o.rx, o.ry, 0, 0, Math.PI); // lower half only (in front of the globe)
      ctx.setLineDash([]);
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = rgba(o.color, 0.6);
    } else {
      ctx.ellipse(0, 0, o.rx, o.ry, 0, 0, Math.PI * 2);
      ctx.setLineDash([2, 5]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(o.color, 0.2);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // satellite: starts at the left tip and sweeps through the front half first
    const f = (((t - o.begin) / o.dur) % 1 + 1) % 1;
    const phi = Math.PI - Math.PI * 2 * f;
    const px = o.rx * Math.cos(phi);
    const py = o.ry * Math.sin(phi);
    const isFront = Math.sin(phi) > 0;
    if ((which === "front") === isFront) {
      const g = ctx.createRadialGradient(px, py, 0, px, py, 11);
      g.addColorStop(0, rgba(o.color, 0.55));
      g.addColorStop(1, rgba(o.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(px, py, 3.2, 0, Math.PI * 2);
      ctx.fill();
      if (which === "front") {
        ctx.font = "600 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillText(o.label, px + 9, py - 8);
      }
    }
    ctx.restore();
  }
}

/** Pseudo-3D rotating Earth using a live NASA VIIRS mosaic + canvas orbits. */
export function GlobeCSS({ size = 220 }: { size?: number }) {
  const nasaUrl = useMemo(() => globeTextureUrl(1024), []);
  // A realistic bundled Earth shows instantly (and works offline); live NASA imagery replaces it once decoded.
  const [url, setUrl] = useState<string>(earthFallback);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const W = size * 1.75;
  const H = size * 1.32;
  // canvases extend past the box so satellite labels near the orbit tips are never clipped
  const PAD = 48;
  const CW = W + PAD * 2;
  const CH = H + PAD * 2;
  const orbits = useMemo<OrbitDef[]>(
    () => [
      { rx: size * 0.8, ry: size * 0.2, rot: -16, dur: 13, begin: 0, color: "#64d2ff", label: "Terra" },
      { rx: size * 0.72, ry: size * 0.3, rot: 30, dur: 18, begin: -7, color: "#30d158", label: "NOAA-20" },
      { rx: size * 0.86, ry: size * 0.13, rot: 6, dur: 23, begin: -12, color: "#ff9f0a", label: "Landsat 9" },
    ],
    [size]
  );

  // Decode textures off the main paint path, then fade in / swap (no decode jank mid-animation).
  useEffect(() => {
    let alive = true;
    preload(earthFallback).then(() => alive && setLoaded(true));
    preload(nasaUrl).then((ok) => {
      if (alive && ok) setUrl(nasaUrl);
    });
    return () => {
      alive = false;
    };
  }, [nasaUrl]);

  // Orbit canvases: ~30 fps, paused when off-screen / tab hidden / reduced motion.
  useEffect(() => {
    const root = rootRef.current;
    const back = backRef.current;
    const front = frontRef.current;
    if (!root || !back || !front) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const setup = (c: HTMLCanvasElement) => {
      c.width = Math.round(CW * dpr);
      c.height = Math.round(CH * dpr);
      const ctx = c.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    };
    const bctx = setup(back);
    const fctx = setup(front);
    if (!bctx || !fctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || !!root.closest(".reduce-motion");
    const start = performance.now();
    const paint = (now: number) => {
      const t = (now - start) / 1000;
      drawLayer(bctx, "back", CW, CH, orbits, t);
      drawLayer(fctx, "front", CW, CH, orbits, t);
    };
    paint(start);

    let raf = 0;
    let last = 0;
    let onScreen = true;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!onScreen || document.hidden || now - last < 33) return;
      last = now;
      paint(now);
    };
    if (!reduced) raf = requestAnimationFrame(loop);
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      setVisible(e.isIntersecting);
    });
    io.observe(root);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [CW, CH, orbits]);

  return (
    <div ref={rootRef} className="relative" style={{ width: W, height: H }}>
      {/* soft atmosphere glow: a cheap gradient instead of two huge blurred box-shadows */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          left: W / 2 - size * 1.15,
          top: H / 2 - size * 1.15,
          width: size * 2.3,
          height: size * 2.3,
          background:
            "radial-gradient(circle closest-side, rgba(64,156,255,0.34) 0%, rgba(64,156,255,0.34) 42%, rgba(64,156,255,0.13) 62%, rgba(64,156,255,0) 100%)",
        }}
      />
      <canvas ref={backRef} className="pointer-events-none absolute" style={{ left: -PAD, top: -PAD, width: CW, height: CH }} />
      <div className="absolute rounded-full" style={{ left: W / 2 - size / 2, top: H / 2 - size / 2, width: size, height: size }}>
        <div
          className="absolute inset-0 overflow-hidden rounded-full bg-[radial-gradient(circle_at_35%_30%,#2b6fd6,#0b2a66_60%,#020814)]"
          style={{ isolation: "isolate", transform: "translateZ(0)" }}
        >
          <div
            className="absolute inset-y-0 left-0 flex animate-globe"
            style={{
              width: size * 4,
              opacity: loaded ? 1 : 0,
              transition: "opacity 1.4s cubic-bezier(.32,.72,0,1)",
              willChange: "transform",
              backfaceVisibility: "hidden",
              animationPlayState: visible ? "running" : "paused",
            }}
          >
            <img src={url} alt="" decoding="async" draggable={false} className="block max-w-none" style={{ width: size * 2, height: size }} />
            <img src={url} alt="" decoding="async" draggable={false} className="block max-w-none" style={{ width: size * 2, height: size }} />
          </div>
          {/* static shading: gradients only (no large inset blur shadows to repaint) */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 31% 27%, rgba(255,255,255,0.30), rgba(255,255,255,0.08) 18%, transparent 36%), radial-gradient(circle at 80% 74%, rgba(0,0,8,0.94), rgba(0,0,8,0) 62%), radial-gradient(circle closest-side at 50% 50%, rgba(0,0,10,0) 66%, rgba(0,0,10,0.62) 100%), radial-gradient(circle closest-side at 50% 50%, rgba(130,195,255,0) 90%, rgba(130,195,255,0.38) 100%)",
            }}
          />
        </div>
        {/* thin blue atmosphere limb: a static gradient, no blur */}
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            inset: -size * 0.04,
            background:
              "radial-gradient(circle closest-side, rgba(120,190,255,0) 86%, rgba(120,190,255,0.34) 94.5%, rgba(120,190,255,0.12) 97.5%, rgba(120,190,255,0) 100%)",
          }}
        />
      </div>
      <canvas ref={frontRef} className="pointer-events-none absolute" style={{ left: -PAD, top: -PAD, width: CW, height: CH }} />
    </div>
  );
}
