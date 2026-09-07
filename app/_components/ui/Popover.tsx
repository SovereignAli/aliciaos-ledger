"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The one floating surface everything else is built on: rendered into
 * document.body so the scrolling canvas can't clip it, placed beside its
 * anchor, closed by Escape, an outside click, scroll, or resize.
 */
export interface PopoverProps {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "start" | "end";
  width?: number | "anchor";
  className?: string;
}

export function Popover({ anchor, open, onClose, children, align = "start", width, className = "" }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; w?: number; up: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 240;
      const w = width === "anchor" ? a.width : width;
      const pw = ref.current?.offsetWidth ?? w ?? 220;
      const up = a.bottom + 8 + h > window.innerHeight - 12 && a.top - 8 - h > 12;
      let left = align === "end" ? a.right - pw : a.left;
      left = Math.max(12, Math.min(left, window.innerWidth - pw - 12));
      setPos({ top: up ? a.top - 8 - h : a.bottom + 8, left, w, up });
    };
    place();
    const raf = requestAnimationFrame(place);
    const onScroll = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, anchor, align, width, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, anchor, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      className={`popover ${pos?.up ? "popover-up" : ""} ${className}`}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width: pos?.w, visibility: pos ? "visible" : "hidden" }}
      role="dialog"
    >
      {children}
    </div>,
    document.body,
  );
}
