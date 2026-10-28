import { useEffect, useRef } from "react";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useApp } from "@/store";

/**
 * Announces connectivity changes through the Dynamic Island. The persistent
 * offline state lives in the island's idle pill (see DynamicIsland), so this
 * event no longer needs to stay pinned — another notification can't erase it.
 */
export function NetworkMonitor() {
  const online = useConnectivity();
  const previous = useRef(online);

  useEffect(() => {
    if (!online) {
      useApp.getState().notify({
        title: "You’re offline",
        subtitle: "Loaded imagery stays available",
        icon: "alert",
        tone: "orange",
        duration: 3600,
      });
    } else if (!previous.current) {
      useApp.getState().notify({
        title: "Back online",
        subtitle: "NASA imagery is available again",
        icon: "check",
        tone: "green",
        duration: 2600,
      });
    }
    previous.current = online;
  }, [online]);

  return null;
}
