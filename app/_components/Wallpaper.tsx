"use client";

import { useEffect, useRef } from "react";
import type { ShaderMount, ShaderMountUniforms } from "@paper-design/shaders";

/**
 * The site's animated backdrop: one dithering shader, two palettes (light is
 * the site's Alex mode, dark is its dark). Lazy-loaded, skipped under reduced
 * motion or without WebGL2, and the CSS wallpaper underneath is the finished
 * background either way. Presets copied from alexwil.com/site/shaders.js.
 */
const PALETTE = {
  light: { back: "#F2EADC", front: "#A38B6B" },
  dark: { back: "#0B0C0A", front: "#6B5E46" },
} as const;
const DRIFT = 0.06;
const MAX_PIXELS = 1920 * 1080;
const MAX_PIXELS_MOBILE = 1280 * 720;

type Mode = keyof typeof PALETTE;

function currentMode(): Mode {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "dark") return "dark";
  if (explicit === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function webgl2Usable(): boolean {
  try {
    const probe = document.createElement("canvas").getContext("webgl2");
    return !!probe && probe.getSupportedExtensions() !== null;
  } catch {
    return false;
  }
}

export function Wallpaper() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!webgl2Usable()) return;

    let disposed = false;
    let mount: ShaderMount | null = null;
    let uniformsFor: ((m: Mode) => ShaderMountUniforms) | null = null;
    let mode = currentMode();

    import("@paper-design/shaders")
      .then((lib) => {
        if (disposed) return;
        const sizing = { ...lib.defaultPatternSizing, scale: 0.8 };
        const grid = {
          u_fit: lib.ShaderFitOptions[sizing.fit],
          u_scale: sizing.scale,
          u_rotation: sizing.rotation,
          u_offsetX: sizing.offsetX,
          u_offsetY: sizing.offsetY,
          u_originX: sizing.originX,
          u_originY: sizing.originY,
          u_worldWidth: sizing.worldWidth,
          u_worldHeight: sizing.worldHeight,
          u_shape: lib.DitheringShapes.warp,
          u_type: lib.DitheringTypes["8x8"],
          u_pxSize: 3,
        };
        uniformsFor = (m) => ({ ...grid, u_colorBack: lib.getShaderColorFromString(PALETTE[m].back), u_colorFront: lib.getShaderColorFromString(PALETTE[m].front) });
        const mobile = window.matchMedia("(max-width: 860px)").matches;
        try {
          mount = new lib.ShaderMount(host, lib.ditheringFragmentShader, uniformsFor(mode), undefined, DRIFT, 0, 1, mobile ? MAX_PIXELS_MOBILE : MAX_PIXELS);
          host.classList.add("ready");
        } catch (err) {
          console.warn("Shader backdrop disabled:", err);
        }
      })
      .catch(() => {});

    const retheme = () => {
      const next = currentMode();
      if (next === mode) return;
      mode = next;
      if (mount && uniformsFor) mount.setUniforms(uniformsFor(mode));
    };
    const obs = new MutationObserver(retheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", retheme);

    return () => {
      disposed = true;
      obs.disconnect();
      mq.removeEventListener("change", retheme);
      mount?.dispose();
      host.classList.remove("ready");
    };
  }, []);

  return <div ref={hostRef} className="wallpaper-fx" aria-hidden="true" />;
}
