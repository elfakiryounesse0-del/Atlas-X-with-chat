import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { addDays, diffDays, MONTHS } from "@/lib/gibs";
import { useMeasure } from "@/components/ui/motion";

const PX = 11; // pixels per day
const W = 75; // days rendered on each side of the anchor

function Tick({ i, iso, offset, disabled }: { i: number; iso: string; offset: MotionValue<number>; disabled: boolean }) {
  const day = Number(iso.slice(8, 10));
  const month = Number(iso.slice(5, 7));
  const isMonth = day === 1;
  const isYear = isMonth && month === 1;
  const scaleY = useTransform(offset, (o) => 1 + Math.max(0, 1 - Math.abs(i - W - o) / 5) * 0.9);
  const opacity = useTransform(offset, (o) => (disabled ? 0.1 : Math.max(0.25, 1 - Math.abs(i - W - o) / 34)));
  return (
    <div className="absolute bottom-2" style={{ left: i * PX }}>
      <motion.div
        style={{ scaleY, opacity }}
        className={cn(
          "w-[2px] origin-bottom -translate-x-1/2 rounded-full",
          isMonth ? "h-[18px] bg-white" : day % 7 === 1 ? "h-[11px] bg-white/85" : "h-[8px] bg-white/60"
        )}
      />
      {isMonth && (
        <motion.span
          style={{ opacity }}
          className={cn(
            "absolute bottom-[25px] -translate-x-1/2 whitespace-nowrap text-[10.5px] font-semibold",
            isYear ? "text-ios-teal" : "text-white/75"
          )}
        >
          {isYear ? iso.slice(0, 4) : MONTHS[month - 1]}
        </motion.span>
      )}
    </div>
  );
}

/** Apple-style scrubbing dial: drag, flick, scroll or click to pick a day. */
export function TimeRuler({
  date,
  min,
  max,
  onChange,
  onPreview,
  className,
}: {
  date: string;
  min: string;
  max: string;
  onChange: (d: string) => void;
  onPreview?: (d: string) => void;
  className?: string;
}) {
  const [ref, { width }] = useMeasure<HTMLDivElement>();
  const [anchor, setAnchor] = useState(date);
  const offset = useMotionValue(0);
  const widthMV = useMotionValue(0);
  const committed = useRef(date);
  const shown = useRef(date);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const drag = useRef<{ x0: number; o0: number; lx: number; lt: number; v: number; moved: number } | null>(null);
  const wheelT = useRef<number | undefined>(undefined);
  const [dragging, setDragging] = useState(false);

  useEffect(() => widthMV.set(width), [width, widthMV]);

  const minOff = diffDays(min, anchor);
  const maxOff = diffDays(max, anchor);
  const clamp = (v: number) => Math.min(maxOff, Math.max(minOff, v));

  const days = useMemo(() => Array.from({ length: W * 2 + 1 }, (_, i) => addDays(anchor, i - W)), [anchor]);
  const x = useTransform([offset, widthMV], ([o, w]) => (w as number) / 2 - (W + (o as number)) * PX);

  useMotionValueEvent(offset, "change", (v) => {
    const d = addDays(anchor, Math.round(v));
    if (d !== shown.current) {
      shown.current = d;
      onPreview?.(d);
    }
  });

  useLayoutEffect(() => {
    offset.jump(diffDays(committed.current, anchor));
  }, [anchor, offset]);

  const commit = (d: string) => {
    committed.current = d;
    shown.current = d;
    onPreview?.(d);
    if (d !== date) onChange(d);
    setAnchor(d);
  };

  const settle = (velocity = 0, target?: number) => {
    anim.current?.stop();
    const t = clamp(Math.round(target ?? offset.get() + velocity * 0.18));
    anim.current = animate(offset, t, {
      type: "spring",
      stiffness: 260,
      damping: 34,
      velocity,
      onComplete: () => commit(addDays(anchor, t)),
    });
  };

  // external date changes (play button, year stepper)
  useEffect(() => {
    if (date === committed.current) return;
    committed.current = date;
    const t = diffDays(date, anchor);
    anim.current?.stop();
    if (Math.abs(t) > W - 8) {
      shown.current = date;
      onPreview?.(date);
      setAnchor(date);
      return;
    }
    anim.current = animate(offset, t, { type: "spring", stiffness: 220, damping: 30, onComplete: () => setAnchor(date) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="slider"
      aria-label="Imagery date"
      aria-valuetext={date}
      className={cn(
        "mask-fade-x relative h-14 touch-none select-none overflow-hidden outline-none",
        dragging ? "cursor-grabbing" : "cursor-grab",
        className
      )}
      onPointerDown={(e) => {
        anim.current?.stop();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x0: e.clientX, o0: offset.get(), lx: e.clientX, lt: performance.now(), v: 0, moved: 0 };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x0;
        d.moved = Math.max(d.moved, Math.abs(dx));
        let o = d.o0 - dx / PX;
        if (o < minOff) o = minOff - (minOff - o) * 0.3;
        if (o > maxOff) o = maxOff + (o - maxOff) * 0.3;
        offset.set(o);
        const now = performance.now();
        const dt = (now - d.lt) / 1000;
        if (dt > 0.001) {
          d.v = 0.8 * (-(e.clientX - d.lx) / PX / dt) + 0.2 * d.v;
          d.lx = e.clientX;
          d.lt = now;
        }
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        setDragging(false);
        if (!d) return;
        if (d.moved < 4) {
          const r = e.currentTarget.getBoundingClientRect();
          settle(0, offset.get() + (e.clientX - (r.left + r.width / 2)) / PX);
        } else settle(Math.max(-70, Math.min(70, d.v)));
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
        settle(0);
      }}
      onWheel={(e) => {
        anim.current?.stop();
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        offset.set(clamp(offset.get() + delta / PX / 1.4));
        window.clearTimeout(wheelT.current);
        wheelT.current = window.setTimeout(() => settle(0), 160);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          settle(0, Math.round(offset.get()) - 1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          settle(0, Math.round(offset.get()) + 1);
        }
      }}
    >
      <motion.div className="absolute inset-y-0 left-0" style={{ x }}>
        {days.map((iso, i) => (
          <Tick key={`${anchor}-${i}`} i={i} iso={iso} offset={offset} disabled={iso < min || iso > max} />
        ))}
      </motion.div>
      <div className="pointer-events-none absolute bottom-1 top-2 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-ios-blue shadow-[0_0_14px_rgba(10,132,255,0.95)]" />
      <div className="pointer-events-none absolute left-1/2 top-1 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-ios-blue ring-2 ring-black/40" />
    </div>
  );
}
