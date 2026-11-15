import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import still from "../../../assets/plane-still.webp";
import { useReducedMotion } from "../../../lib/motion";
import type { PlaneSceneHandle } from "./scene";
import { webglAvailable } from "./webgl";

/**
 * Size of the committed still (scripts/render-plane-still.mjs renders it at 1280×560). The box has
 * the same 16:7 ratio at every width (PLANE_ASPECT in scene.ts frames the plane for it), so the
 * still fills it edge to edge and the canvas fades in over the same picture.
 */
const STILL_WIDTH = 1280;
const STILL_HEIGHT = 560;
/** Below this width the hero stays on the still image (OQ1). */
const WIDE_QUERY = "(min-width: 768px)";

export interface PlaneHeroProps {
  className?: string;
}

function wideQuery(): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia(WIDE_QUERY) : null;
}

function wideEnough(): boolean {
  return wideQuery()?.matches ?? false;
}

function subscribeWide(onChange: () => void): () => void {
  const mql = wideQuery();
  if (!mql) return () => {};
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }
  mql.addListener(onChange);
  return () => mql.removeListener(onChange);
}

/**
 * The 3D airliner over its still image. The still is always rendered; the three.js chunk is
 * imported only when WebGL works, motion is allowed, the screen is wide and the box is in view,
 * and the canvas fades in over the still once the scene has drawn its first frame. The still fades
 * out only after the canvas is fully in, so no frame is blank, and comes back at once whenever the
 * scene is torn down. Crossing the 768 px breakpoint starts or
 * stops the scene.
 */
export function PlaneHero({ className }: PlaneHeroProps): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();
  const wide = useSyncExternalStore(subscribeWide, wideEnough, () => false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas || reducedMotion) return;
    if (typeof IntersectionObserver === "undefined" || !wide || !webglAvailable()) return;

    // Effect-scoped guards: `alive` turns false on cleanup, `loading` makes the import single-flight.
    let alive = true;
    let loading = false;
    let intersecting = false;
    let handle: PlaneSceneHandle | null = null;

    const sync = () => {
      if (!handle) return;
      if (intersecting && !document.hidden) handle.start();
      else handle.stop();
    };

    const load = () => {
      if (loading) return;
      loading = true;
      import("./scene")
        .then(({ mountPlaneScene }) => {
          if (!alive) return;
          const created = mountPlaneScene(canvas, {
            maxDpr: 2,
            onFirstFrame: () => {
              if (alive) setReady(true);
            },
          });
          if (!alive) {
            created.dispose();
            return;
          }
          handle = created;
          if (box.clientWidth > 0 && box.clientHeight > 0) {
            handle.resize(box.clientWidth, box.clientHeight);
          }
          sync();
        })
        .catch(() => {
          // A failed chunk load or WebGLUnavailableError keeps the still image.
        });
    };

    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      intersecting = Boolean(entry.isIntersecting);
      if (intersecting) load();
      sync();
    });
    io.observe(box);

    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            const rect = entries[entries.length - 1]?.contentRect;
            if (rect) handle?.resize(rect.width, rect.height);
          });
    ro?.observe(box);

    document.addEventListener("visibilitychange", sync);

    return () => {
      alive = false;
      io.disconnect();
      ro?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      handle?.dispose();
      handle = null;
      // Back to the still until a new scene draws its first frame.
      setReady(false);
    };
  }, [reducedMotion, wide]);

  return (
    <div ref={boxRef} className={`relative aspect-16/7 w-full ${className ?? ""}`.trim()}>
      <img
        src={still}
        alt=""
        width={STILL_WIDTH}
        height={STILL_HEIGHT}
        decoding="async"
        data-visible={ready ? "false" : "true"}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-[var(--duration-grow)] ease-[var(--ease-out)] ${ready ? "opacity-0 delay-[var(--duration-grow)]" : "opacity-100"}`}
      />
      {reducedMotion ? null : (
        <canvas
          ref={canvasRef}
          data-visible={ready ? "true" : "false"}
          className={`absolute inset-0 h-full w-full transition-opacity duration-[var(--duration-grow)] ease-[var(--ease-out)] ${ready ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}
