import { motion } from "framer-motion";
import { useEffect } from "react";
import { appleEase } from "@/components/ui/primitives";
import { AppIcon } from "./AppIcon";

export function Splash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 2300);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      className="starfield absolute inset-0 z-[200] grid place-items-center"
      exit={{ opacity: 0, scale: 1.08 }}
      transition={{ duration: 0.75, ease: appleEase }}
      onClick={onDone}
    >
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(10,132,255,0.28), transparent 62%)" }}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.6, ease: appleEase }}
      />
      <div className="relative flex flex-col items-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 150, damping: 15, delay: 0.15 }}
        >
          <AppIcon size={104} animated />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 12, letterSpacing: "0.3em" }}
          animate={{ opacity: 1, y: 0, letterSpacing: "-0.02em" }}
          transition={{ delay: 0.55, duration: 1, ease: appleEase }}
          className="mt-7 text-[38px] font-bold"
        >
          Epoch
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.8, ease: appleEase }}
          className="mt-1 text-[16px] text-white/55"
        >
          Earth, over time.
        </motion.p>
        <div className="mt-10 h-[3px] w-40 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-ios-blue to-ios-teal"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 1.8, delay: 0.3, ease: appleEase }}
          />
        </div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="mt-3 text-[11.5px] text-white/35">
          Connecting to NASA GIBS…
        </motion.p>
      </div>
    </motion.div>
  );
}
