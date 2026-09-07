"use client";

import { DocIcon } from "../Icons";
import { useWindowManager } from "./WindowManager";

/** A folder's files. Collapsed folders keep their last-known files so the tree animates between sections. */
export function SidebarFiles({ section, collapsed }: { section: string; collapsed: boolean }) {
  const wm = useWindowManager();
  const files = wm.filesFor(section);
  return (
    <div className={`tree-children ${collapsed || files.length === 0 ? "collapsed" : ""}`} role="group" aria-hidden={collapsed}>
      {files.map((w, i) => (
        <button key={w.id} type="button" className="tree-item" onClick={() => wm.focus(w.id)} tabIndex={collapsed ? -1 : 0}>
          <span className="tree-branch">{i === files.length - 1 ? "└" : "├"}</span>
          <DocIcon />
          <span className="truncate">{w.title}</span>
        </button>
      ))}
    </div>
  );
}
