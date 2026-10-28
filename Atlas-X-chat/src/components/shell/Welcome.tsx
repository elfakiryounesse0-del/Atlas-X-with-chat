import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { ArrowRight, Satellite, Sparkles, X } from "lucide-react";
import { useApp } from "@/store";
import { GlobeCSS } from "@/components/GlobeCSS";
import { Button, IconButton, appleEase } from "@/components/ui/primitives";
import { AppIcon } from "./AppIcon";

/** One-time, task-first welcome shown after the launch animation. */
export function Welcome() {
  const complete = useApp((s) => s.completeWelcome);
  const setView = useApp((s) => s.setView);
  const primary = useRef<HTMLButtonElement>(null);

  // Freeze the drifting background blobs while the welcome is open: they sit under a glass panel,
  // and re-blurring them every frame is a major source of lag.
  useEffect(() => {
    document.documentElement.classList.add("bg-paused");
    return () => document.documentElement.classList.remove("bg-paused");
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => primary.current?.focus(), 450);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") complete();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", key);
    };
  }, [complete]);

  const start = (view: "today" | "explore") => {
    complete();
    setView(view);
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      className="absolute inset-0 z-[190] grid place-items-center overflow-hidden bg-black/75 p-3 sm:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="pointer-events-none absolute h-[680px] w-[680px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(10,132,255,0.24), transparent 64%)", willChange: "transform, opacity" }}
        initial={{ scale: 0.65, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 1.15, opacity: 0 }}
        transition={{ duration: 1.2, ease: appleEase }}
      />

      <motion.section
        // No animated `filter: blur()` here: blurring a large glass panel (with the globe inside) every
        // frame was the main cause of the stutter. Opacity + transform stay on the GPU.
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 1.03 }}
        transition={{ type: "spring", stiffness: 250, damping: 28, delay: 0.12 }}
        className="scroll-area relative grid max-h-full w-full max-w-[820px] overflow-y-auto rounded-[36px] glass-strong liquid sm:grid-cols-[0.9fr_1.1fr] sm:overflow-hidden"
      >
        <IconButton
          icon={X}
          label="Skip welcome"
          variant="solid"
          className="absolute right-4 top-4 z-20"
          onClick={() => complete()}
        />

        <div className="relative hidden min-h-[520px] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_50%,rgba(10,132,255,0.2),transparent_60%)] sm:flex">
          <motion.div
            initial={{ opacity: 0, scale: 0.75, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            style={{ willChange: "transform, opacity" }}
            transition={{ type: "spring", stiffness: 160, damping: 18, delay: 0.35 }}
          >
            <GlobeCSS size={190} />
          </motion.div>
          <div className="absolute bottom-7 left-7 right-7 flex items-center justify-between rounded-full px-4 py-2.5 glass">
            <span className="flex items-center gap-2 text-[12px] font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-ios-green" />
                <span className="relative rounded-full bg-ios-green" />
              </span>
              NASA GIBS live
            </span>
            <span className="text-[11.5px] text-white/45">Daily Earth imagery</span>
          </div>
        </div>

        <div className="flex min-h-0 flex-col justify-center px-6 py-10 sm:min-h-[520px] sm:px-10">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32 }}
            className="flex items-center gap-3"
          >
            <AppIcon size={48} animated />
            <div>
              <div className="text-[28px] font-bold tracking-[-0.035em]">Epoch</div>
              <div className="text-[12.5px] font-medium text-white/45">Earth, over time</div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.46 }}>
            <h1 id="welcome-title" className="mt-9 text-[30px] font-bold leading-[1.08] tracking-[-0.035em] sm:text-[36px]">
              See what changed.<br />Understand why.
            </h1>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/55">
              Scrub through daily satellite passes, compare two moments, and keep watch over the places that matter to you.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.58 }}
            className="mt-8 flex flex-col gap-2.5"
          >
            <Button
              ref={primary}
              variant="blue"
              size="lg"
              icon={Satellite}
              className="w-full justify-between px-5"
              onClick={() => start("explore")}
            >
              <span>Explore Earth</span>
              <ArrowRight size={17} />
            </Button>
            <Button variant="glass" size="lg" icon={Sparkles} className="w-full" onClick={() => start("today")}>
              Open my daily briefing
            </Button>
          </motion.div>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.72 }} className="mt-5 text-center text-[11.5px] text-white/30">
            Public NASA imagery. No API key or account required.
          </motion.p>
        </div>
      </motion.section>
    </motion.div>
  );
}