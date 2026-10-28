import { useEffect, useRef, useState } from "react";
import * as maplibreNS from "maplibre-gl";
import type { Map as MLMap, Marker as MLMarker, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { create } from "zustand";
import { Globe } from "lucide-react";
import { cn } from "@/utils/cn";
import { useApp } from "@/store";
import { PLACES, placeById } from "@/data/places";
import { layerById, tileUrl, type LayerId } from "@/lib/gibs";

// v5 ships UMD — normalise default/namespace interop.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const maplibregl: any = (maplibreNS as any).default ?? maplibreNS;

interface Telemetry {
  bearing: number;
  zoom: number;
  globe: boolean;
  loading: boolean;
  ready: boolean;
  failed: boolean;
}
export const useMapTelemetry = create<Telemetry>(() => ({
  bearing: 0,
  zoom: 1.7,
  globe: true,
  loading: false,
  ready: false,
  failed: false,
}));

const HOME = { center: [52, 22] as [number, number], zoom: 1.75 };

export function MapView({ active }: { active: boolean }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const readyRef = useRef(false);
  const layerIds = useRef<string[]>([]);
  const seq = useRef(0);
  const markers = useRef(new Map<string, { marker: MLMarker; el: HTMLElement }>());
  const interacting = useRef(false);
  const activeRef = useRef(active);
  const rotateRef = useRef(true);
  const spinRef = useRef<() => void>(() => {});

  const layer = useApp((s) => s.layer);
  const date = useApp((s) => s.exploreDate);
  const focus = useApp((s) => s.focusPlace);
  const flyNonce = useApp((s) => s.flyNonce);
  const mapCmd = useApp((s) => s.mapCmd);
  const autoRotate = useApp((s) => s.settings.autoRotate);
  const showLabels = useApp((s) => s.settings.showLabels);
  const failed = useMapTelemetry((s) => s.failed);
  const welcomeSeen = useApp((s) => s.welcomeSeen);
  const pendingFly = useRef(false);

  // The WebGL globe + GIBS tile downloads are heavy. Don't start them while the splash / welcome / globe
  // intro are animating: start when Explore is opened, or pre-warm quietly a few seconds after the welcome.
  const [started, setStarted] = useState(active);
  useEffect(() => {
    if (started) return;
    if (active) {
      setStarted(true);
      return;
    }
    if (!welcomeSeen) return;
    let idle = 0;
    const t = window.setTimeout(() => {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) idle = ric(() => setStarted(true), { timeout: 4000 });
      else setStarted(true);
    }, 3500);
    return () => {
      window.clearTimeout(t);
      const cic = (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (idle && cic) cic(idle);
    };
  }, [active, welcomeSeen, started]);

  /** Add a new imagery layer on top and remove older ones once it has loaded (crossfade). */
  const swap = (map: MLMap, id: LayerId, d: string) => {
    const l = layerById(id);
    const day = d < l.minDate ? l.minDate : d;
    const sid = `gibs-${++seq.current}`;
    try {
      map.addSource(sid, { type: "raster", tiles: [tileUrl(l, day)], tileSize: 256, maxzoom: 9, attribution: "NASA GIBS" });
      map.addLayer({ id: sid, type: "raster", source: sid, paint: { "raster-fade-duration": 450 } });
    } catch {
      return;
    }
    const old = layerIds.current.slice();
    layerIds.current.push(sid);
    let done = false;
    const cleanup = () => {
      old.forEach((o) => {
        try {
          if (map.getLayer(o)) map.removeLayer(o);
          if (map.getSource(o)) map.removeSource(o);
        } catch {
          /* noop */
        }
      });
      layerIds.current = layerIds.current.filter((x) => !old.includes(x));
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onData = (e: any) => {
      if (e.sourceId === sid && e.isSourceLoaded) finish();
    };
    const finish = () => {
      if (done) return;
      done = true;
      map.off("sourcedata", onData);
      window.setTimeout(cleanup, 700);
    };
    map.on("sourcedata", onData);
    window.setTimeout(finish, 6000);
  };

  // init once
  useEffect(() => {
    if (!started) return;
    const el = elRef.current;
    if (!el) return;
    let map: MLMap;
    try {
      const style = {
        version: 8,
        projection: { type: "globe" },
        sources: {},
        layers: [],
        sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] },
        light: { anchor: "map", position: [1.5, 90, 80] },
      } as unknown as StyleSpecification;
      map = new maplibregl.Map({
        container: el,
        style,
        center: HOME.center,
        zoom: HOME.zoom,
        minZoom: 0.6,
        maxZoom: 10.5,
        attributionControl: false,
        // cap the render resolution: a full-screen WebGL globe at 2x-3x DPR is very GPU-heavy
        ...({ pixelRatio: Math.min(window.devicePixelRatio || 1, document.documentElement.classList.contains("perf-lite") ? 1 : 1.5) } as object),
        fadeDuration: 300,
        pitchWithRotate: false,
      });
    } catch (err) {
      console.warn("[Epoch] Map failed to start", err);
      useMapTelemetry.setState({ failed: true });
      return;
    }
    mapRef.current = map;

    const spin = () => {
      if (!activeRef.current || !rotateRef.current || interacting.current) return;
      if (useApp.getState().focusPlace) return;
      const z = map.getZoom();
      if (z > 4) return;
      let dps = 360 / 160;
      if (z > 2.5) dps *= (4 - z) / 1.5;
      const c = map.getCenter();
      c.lng -= dps;
      map.easeTo({ center: c, duration: 1000, easing: (n: number) => n });
    };
    spinRef.current = spin;

    map.on("load", () => {
      readyRef.current = true;
      const s = useApp.getState();
      swap(map, s.layer, s.exploreDate);
      PLACES.forEach((p) => {
        const mel = document.createElement("button");
        mel.type = "button";
        mel.className = "epoch-marker";
        mel.style.setProperty("--c", p.color);
        mel.setAttribute("aria-label", p.name);
        mel.innerHTML = `<span class="ring"></span><span class="dot"></span><span class="label">${p.name}</span>`;
        mel.addEventListener("click", (ev) => {
          ev.stopPropagation();
          useApp.getState().selectPlace(p.id);
        });
        const marker = new maplibregl.Marker({ element: mel, anchor: "center" }).setLngLat([p.lon, p.lat]).addTo(map);
        markers.current.set(p.id, { marker, el: mel });
      });
      const f = useApp.getState().focusPlace;
      if (f) markers.current.get(f)?.el.classList.add("is-active");
      useMapTelemetry.setState({ ready: true });
      if (pendingFly.current && f) {
        // a "fly to place" request arrived before the map existed
        pendingFly.current = false;
        const p = placeById(f);
        const wide = window.innerWidth >= 1024;
        const sidebar = useApp.getState().sidebarOpen;
        map.flyTo({
          center: [p.lon, p.lat],
          zoom: p.zoom - 0.3,
          speed: 0.85,
          curve: 1.45,
          essential: true,
          padding: { left: wide ? (sidebar ? 290 : 0) + 380 : 0, top: 60, right: 80, bottom: wide ? 130 : 300 },
        });
      }
      spin();
    });

    map.on("error", () => {
      /* tile errors are expected for cloudy/no-data days */
    });
    map.on("rotate", () => useMapTelemetry.setState({ bearing: map.getBearing() }));
    map.on("zoomend", () => useMapTelemetry.setState({ zoom: map.getZoom() }));
    map.on("dataloading", () => useMapTelemetry.setState({ loading: true }));
    map.on("idle", () => useMapTelemetry.setState({ loading: false }));

    const stop = () => {
      interacting.current = true;
    };
    const resume = () => {
      interacting.current = false;
      spin();
    };
    map.on("mousedown", stop);
    map.on("touchstart", stop);
    map.on("mouseup", resume);
    map.on("touchend", resume);
    map.on("dragend", resume);
    map.on("moveend", spin);

    return () => {
      readyRef.current = false;
      markers.current.clear();
      layerIds.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [started]);

  // imagery layer / date changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    swap(map, layer, date);
  }, [layer, date]);

  // active marker
  useEffect(() => {
    markers.current.forEach(({ el }, id) => el.classList.toggle("is-active", id === focus));
    if (!focus) spinRef.current();
  }, [focus]);

  // fly to place
  useEffect(() => {
    const map = mapRef.current;
    const id = useApp.getState().focusPlace;
    if (!map && id && flyNonce > 0) pendingFly.current = true;
    if (!map || !id || flyNonce === 0) return;
    const p = placeById(id);
    const wide = window.innerWidth >= 1024;
    const sidebar = useApp.getState().sidebarOpen;
    map.flyTo({
      center: [p.lon, p.lat],
      zoom: p.zoom - 0.3,
      speed: 0.85,
      curve: 1.45,
      essential: true,
      padding: { left: wide ? (sidebar ? 290 : 0) + 380 : 0, top: 60, right: 80, bottom: wide ? 130 : 300 },
    });
  }, [flyNonce]);

  // control commands
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapCmd) return;
    switch (mapCmd.kind) {
      case "zoomIn":
        map.zoomIn({ duration: 450 });
        break;
      case "zoomOut":
        map.zoomOut({ duration: 450 });
        break;
      case "north":
        map.easeTo({ bearing: 0, pitch: 0, duration: 700 });
        break;
      case "home":
        map.flyTo({ center: HOME.center, zoom: HOME.zoom, bearing: 0, pitch: 0, speed: 1.1, essential: true, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
        break;
      case "projection": {
        const globe = !useMapTelemetry.getState().globe;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (map as any).setProjection({ type: globe ? "globe" : "mercator" });
          useMapTelemetry.setState({ globe });
        } catch {
          /* noop */
        }
        break;
      }
    }
  }, [mapCmd]);

  useEffect(() => {
    activeRef.current = active;
    const map = mapRef.current;
    if (!map) return;
    if (active) {
      map.resize();
      const t = window.setTimeout(() => spinRef.current(), 350);
      return () => window.clearTimeout(t);
    }
    map.stop();
  }, [active]);

  useEffect(() => {
    rotateRef.current = autoRotate;
    if (autoRotate) spinRef.current();
    else mapRef.current?.stop();
  }, [autoRotate]);

  return (
    <div
      aria-hidden={!active}
      className={cn(
        "absolute inset-0 transition-opacity duration-700 ease-apple",
        active ? "opacity-100" : "pointer-events-none opacity-0",
        showLabels && "show-labels"
      )}
    >
      <div className="starfield absolute inset-0" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(50% 55% at 55% 50%, rgba(30,90,200,0.22), transparent 70%)" }} />
      <div ref={elRef} style={{ position: "absolute", inset: 0 }} />
      {failed && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <div className="max-w-sm rounded-[28px] p-6 text-center glass-strong">
            <Globe className="mx-auto mb-3 text-white/40" size={32} />
            <h3 className="text-[17px] font-semibold">3D globe unavailable</h3>
            <p className="mt-1 text-[13px] text-white/50">This browser couldn’t start WebGL. Compare and Timelapse still work with NASA imagery.</p>
          </div>
        </div>
      )}
    </div>
  );
}
