"use client";

import { useEffect, useRef } from "react";
import type { ShaderMount, ShaderMountUniforms } from "@paper-design/shaders";

/**
 * Alicia's animated backdrop: Paper's Warp shader, checks pattern, in her
 * plum-to-lavender palette. The preset is the one she picked at
 * shaders.paper.design (proportion .5, softness 1, distortion .09, swirl .9,
 * six iterations, checks at .25, scale 2.5, rotation 1.35); light mode runs
 * the same motion through paler tints. Lazy-loaded, skipped under reduced
 * motion or without WebGL2, and the CSS wallpaper underneath is the finished
 * background either way.
 */
const PALETTE = {
  dark: ["#2f153d", "#774794", "#c285ff"],
  light: ["#efe6f8", "#c9ade4", "#9a6ec3"],
} as const;
const SPEED = 2;
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
      .then(async (lib) => {
        // Warp samples a small noise image; the mount refuses it until it has decoded.
        const noise = lib.getShaderNoiseTexture();
        if (noise && !noise.complete) await new Promise<void>((done) => { noise.onload = () => done(); noise.onerror = () => done(); });
        if (disposed) return;
        const sizing = { ...lib.defaultPatternSizing, scale: 2.5, rotation: 1.35 };
        const base: ShaderMountUniforms = {
          u_fit: lib.ShaderFitOptions[sizing.fit],
          u_scale: sizing.scale,
          u_rotation: sizing.rotation,
          u_offsetX: sizing.offsetX,
          u_offsetY: sizing.offsetY,
          u_originX: sizing.originX,
          u_originY: sizing.originY,
          u_worldWidth: sizing.worldWidth,
          u_worldHeight: sizing.worldHeight,
          u_proportion: 0.5,
          u_softness: 1,
          u_shape: lib.WarpPatterns.checks,
          u_shapeScale: 0.25,
          u_distortion: 0.09,
          u_swirl: 0.9,
          u_swirlIterations: 6,
          u_noiseTexture: noise,
        };
        uniformsFor = (m) => {
          const colors = PALETTE[m].map((c) => lib.getShaderColorFromString(c));
          return { ...base, u_colors: colors, u_colorsCount: colors.length };
        };
        const mobile = window.matchMedia("(max-width: 860px)").matches;
        try {
          mount = new lib.ShaderMount(host, lib.warpFragmentShader, uniformsFor(mode), undefined, SPEED, 0, 1, mobile ? MAX_PIXELS_MOBILE : MAX_PIXELS);
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
