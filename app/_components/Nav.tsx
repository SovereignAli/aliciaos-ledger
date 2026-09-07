"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PairedIcon, SECTION_ICON } from "./HeroIcons";
import { SidebarFiles } from "./windows/SidebarFiles";

const ITEMS = [
  { href: "/", section: "overview", label: "Overview" },
  { href: "/cash", section: "cash", label: "Cash" },
  { href: "/savings", section: "savings", label: "Savings" },
  { href: "/investments", section: "investments", label: "Investments" },
  { href: "/transactions", section: "transactions", label: "Transactions" },
  { href: "/budgets", section: "budgets", label: "Budgets" },
  { href: "/income", section: "income", label: "Income" },
];

/** The site's file tree: sections as folders; the open one lists its windows as files, the rest fold up. */
export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Sections" className="tree" role="tree">
      {ITEMS.map((it) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <div key={it.href}>
            <Link href={it.href} className={`tree-folder ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} aria-expanded={active} role="treeitem">
              <span className="folder-ico">
                <PairedIcon name={SECTION_ICON[it.section]} />
              </span>
              {it.label}
            </Link>
            <SidebarFiles section={it.section} collapsed={!active} />
          </div>
        );
      })}
    </nav>
  );
}
