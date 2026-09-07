"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { sectionOf, slugify, useWindowManager } from "./windows/WindowManager";

/** The site's card: 28px continuous corners, layered shadow, a mono title. Listed in the sidebar as a file. */
export function Window({ title, right, children, className = "", bodyClassName = "", small = false, style, id, order }: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  small?: boolean;
  style?: React.CSSProperties;
  id?: string;
  order?: number;
}) {
  const wm = useWindowManager();
  const section = sectionOf(usePathname());
  const reactId = useId();
  const winId = id ?? (title ? slugify(title) : `w${reactId}`);
  const order_ = order ?? Number((style as Record<string, unknown> | undefined)?.["--i"] ?? 50);
  const register = wm.register;
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!title) return;
    return register(section, { id: winId, title, order: order_ });
  }, [register, section, winId, title, order_]);

  return (
    <section
      className={`window ${small ? "window-sm" : ""} ${settled ? "settled" : ""} ${className}`}
      style={style}
      data-window={winId}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && e.animationName === "win-in") setSettled(true);
      }}
    >
      {title ? (
        <div className="titlebar">
          <span className="label">{title}</span>
          {right ? <span className="right">{right}</span> : null}
        </div>
      ) : null}
      <div className={`window-content ${bodyClassName || (title ? "px-[22px] pb-[22px] pt-1" : "p-[22px]")}`}>{children}</div>
    </section>
  );
}
