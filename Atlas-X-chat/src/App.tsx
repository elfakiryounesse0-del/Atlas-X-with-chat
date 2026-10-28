import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { useApp, type View } from "@/store";
import { Sidebar, NAV_ITEMS } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { TabBar } from "@/components/shell/TabBar";
import { DynamicIsland } from "@/components/shell/DynamicIsland";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { SettingsSheet } from "@/components/shell/SettingsSheet";
import { Splash } from "@/components/shell/Splash";
import { Welcome } from "@/components/shell/Welcome";
import { NetworkMonitor } from "@/components/shell/NetworkMonitor";
import { MorphLayer } from "@/components/shell/MorphLayer";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { MapView } from "@/components/MapView";
import { appleEase } from "@/components/ui/primitives";
import { useAppNavigation, viewIndex } from "@/lib/navigation";
import { useMorph } from "@/lib/morph";
import { safeSession } from "@/lib/keys";
import { Today } from "@/views/Today";
import { Explore } from "@/views/Explore";
import { Compare } from "@/views/Compare";
import { Timelapse } from "@/views/Timelapse";
import { Places } from "@/views/Places";
import { Alerts } from "@/views/Alerts";

const VIEWS: Record<View, () => React.ReactElement> = {
  today: Today,
  explore: Explore,
  compare: Compare,
  timelapse: Timelapse,
  places: Places,
  alerts: Alerts,
};

const VIEW_AURA: Record<View, string> = {
  today: "rgba(10,132,255,0.2)",
  explore: "rgba(10,132,255,0)",
  compare: "rgba(191,90,242,0.2)",
  timelapse: "rgba(255,159,10,0.17)",
  places: "rgba(48,209,88,0.15)",
  alerts: "rgba(255,69,58,0.16)",
};

function Backdrop({ hidden, view }: { hidden: boolean; view: View }) {
  return (
    <div className={cn("absolute inset-0 transition-opacity duration-700", hidden ? "opacity-0" : "opacity-100")}>
      <div className="starfield absolute inset-0 opacity-70" />
      <AnimatePresence initial={false}>
        <motion.div
          key={view}
          className="absolute inset-0"
          style={{ background: `radial-gradient(70% 65% at 55% 35%, ${VIEW_AURA[view]}, transparent 68%)` }}
          initial={{ opacity: 0, scale: 1.08 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 1, ease: appleEase }}
        />
      </AnimatePresence>
      <div
        className="absolute -left-[15%] -top-[25%] h-[80vh] w-[70vw] animate-drift rounded-full"
        style={{ background: "radial-gradient(circle, rgba(10,132,255,0.22), transparent 62%)" }}
      />
      <div
        className="absolute -right-[15%] top-[5%] h-[70vh] w-[60vw] animate-drift rounded-full [animation-delay:-8s]"
        style={{ background: "radial-gradient(circle, rgba(94,92,230,0.2), transparent 62%)" }}
      />
      <div
        className="absolute -bottom-[30%] left-[25%] h-[70vh] w-[60vw] animate-drift rounded-full [animation-delay:-15s]"
        style={{ background: "radial-gradient(circle, rgba(100,210,255,0.12), transparent 62%)" }}
      />
    </div>
  );
}

function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useApp.getState();
      // First-run welcome (and the splash before it) owns the keyboard.
      if (!s.welcomeSeen) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        s.setPalette(!s.paletteOpen);
        return;
      }
      if (mod && e.key === ",") {
        e.preventDefault();
        s.setSettings(true);
        return;
      }
      if (mod && e.key === "\\") {
        e.preventDefault();
        s.toggleSidebar();
        return;
      }
      if (e.key === "Escape") {
        if (s.paletteOpen) s.setPalette(false);
        else if (s.settingsOpen) s.setSettings(false);
        return;
      }
      if (typing || mod || e.altKey || e.repeat || s.paletteOpen || s.settingsOpen) return;
      if (document.querySelector("[data-modal-open]")) return;
      if (e.key === "/") {
        e.preventDefault();
        s.setPalette(true);
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= NAV_ITEMS.length) s.setView(NAV_ITEMS[n - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

interface PageCustom {
  /** Navigation direction in tab order: 1 forward, -1 back. */
  d: number;
  /** A shared element is in flight between the two pages. */
  morph: boolean;
}

/**
 * While a shared element is flying between pages, the pages only cross-fade:
 * sliding the page at the same time would move the morph's landing spot.
 */
const pageVariants = {
  // No animated `filter: blur()` on whole pages: it forces the browser to re-blur every glass card and
  // the globe on each frame. Opacity + slide + scale are compositor-only and stay smooth.
  enter: ({ d, morph }: PageCustom) => (morph ? { opacity: 0 } : { opacity: 0, x: d * 28, scale: 0.99 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: ({ d, morph }: PageCustom) => (morph ? { opacity: 0 } : { opacity: 0, x: d * -20, scale: 0.995 }),
};

export default function App() {
  const view = useApp((s) => s.view);
  const settingsOpen = useApp((s) => s.settingsOpen);
  const reduce = useApp((s) => s.settings.reduceMotion);
  const welcomeSeen = useApp((s) => s.welcomeSeen);
  const morphing = useMorph((s) => !!s.ghost && !s.ghost.persist);
  const previousView = useRef(view);
  const [booted, setBooted] = useState(() => safeSession("epoch-booted") === "1");
  const finishBoot = useCallback(() => {
    safeSession("epoch-booted", "1");
    setBooted(true);
  }, []);

  useHotkeys();
  useAppNavigation();
  const ViewComponent = VIEWS[view];
  const isExplore = view === "explore";
  const direction = Math.sign(viewIndex(view) - viewIndex(previousView.current)) || 1;
  const custom: PageCustom = { d: direction, morph: morphing };

  useEffect(() => {
    previousView.current = view;
  }, [view]);

  return (
    <MotionConfig reducedMotion={reduce ? "always" : "user"}>
      <div className={cn("fixed inset-0 overflow-hidden bg-black text-white", reduce && "reduce-motion")}>
        <motion.div
          className="absolute inset-0 overflow-hidden"
          style={{ transformOrigin: "50% 100%" }}
          initial={false}
          animate={
            settingsOpen
              ? { scale: 0.93, y: 12, borderRadius: 32, opacity: 0.5 }
              : // Opening morph: the app settles in from slightly larger as the splash dissolves.
                { scale: booted ? 1 : 1.06, y: 0, borderRadius: 0, opacity: booted ? 1 : 0.35 }
          }
          transition={booted && !settingsOpen ? { type: "spring", stiffness: 140, damping: 24 } : { type: "spring", stiffness: 300, damping: 34 }}
        >
          <Backdrop hidden={isExplore} view={view} />
          <MapView active={isExplore} />

          <AnimatePresence initial={false} custom={custom} mode="popLayout">
            <motion.main
              key={view}
              custom={custom}
              className={cn("absolute inset-0", isExplore && "pointer-events-none")}
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: appleEase }}
            >
              <ViewComponent />
            </motion.main>
          </AnimatePresence>

          <Sidebar />
          <TopBar />
          <TabBar />
        </motion.div>

        {/* In-tree overlay root: portals land here so they stack below the island, palette and settings. */}
        <div id="overlay-root" className="contents" />

        <MorphLayer />
        <ChatWidget />
        <DynamicIsland />
        <NetworkMonitor />
        <CommandPalette />
        <SettingsSheet />

        <AnimatePresence>{!booted && <Splash key="splash" onDone={finishBoot} />}</AnimatePresence>
        <AnimatePresence>{booted && !welcomeSeen && <Welcome key="welcome" />}</AnimatePresence>
      </div>
    </MotionConfig>
  );
}
