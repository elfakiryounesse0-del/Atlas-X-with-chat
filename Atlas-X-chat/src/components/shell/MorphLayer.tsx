import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import { Search } from "lucide-react";
import { useApp } from "@/store";
import { useMorph, type Radius } from "@/lib/morph";
import { morphTransition } from "@/components/CompareStage";

function radiusStyle(r: Radius): CSSProperties {
  if (typeof r === "number") return { borderRadius: r };
  const [tl, tr, br, bl] = r;
  return { borderTopLeftRadius: tl, borderTopRightRadius: tr, borderBottomRightRadius: br, borderBottomLeftRadius: bl };
}

/**
 * Renders the in-flight morph ghost. It subscribes to the navigation state on
 * purpose: re-rendering in the same commit that mounts the destination makes
 * Framer snapshot the ghost, which is what the destination animates from.
 */
export function MorphLayer() {
  const ghost = useMorph((s) => s.ghost);
  useMorph((s) => s.pulse);
  useApp((s) => s.view);
  useApp((s) => s.paletteOpen);
  useApp((s) => s.focusPlace);
  useApp((s) => s.placeId);
  if (!ghost) return null;
  const { rect } = ghost;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[89]">
      <motion.div
        key={ghost.id}
        layoutId={ghost.target}
        transition={morphTransition}
        className="absolute overflow-hidden"
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, ...radiusStyle(ghost.radius) }}
      >
        {ghost.kind === "image" && ghost.src ? (
          <img src={ghost.src} alt="" draggable={false} className="h-full w-full object-cover" />
        ) : (
          <div className="glass-strong flex h-full w-full items-center px-3.5 text-white/45" style={{ borderRadius: "inherit" }}>
            <Search size={15} />
          </div>
        )}
      </motion.div>
    </div>
  );
}
