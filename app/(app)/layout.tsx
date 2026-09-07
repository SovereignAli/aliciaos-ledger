import { requireUserId } from "@/lib/auth";
import { listLinkedInstitutions } from "@/lib/queries/connections";
import { BanksCard } from "../_components/BanksCard";
import { Drawer } from "../_components/Drawer";
import { PlaidLogo } from "../_components/PlaidLogo";
import { Nav } from "../_components/Nav";
import { SettingsButton } from "../_components/SettingsButton";
import { ThemeToggle } from "../_components/ThemeToggle";
import { Wallpaper } from "../_components/Wallpaper";
import { WindowManagerProvider } from "../_components/windows/WindowManager";

/**
 * The desktop, as on the site: wallpaper under everything, one fixed frame
 * holding the glass sidebar and the canvas, and only the canvas scrolls.
 * Below the lg breakpoint it falls back to a normal scrolling page.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUserId();
  const institutions = await listLinkedInstitutions();
  return (
    <WindowManagerProvider>
      <div className="wallpaper" aria-hidden="true"><Wallpaper /></div>
      <div className="canvas-frame relative z-[2] flex flex-col lg:min-h-0 lg:flex-row">
        <Drawer>
          <div className="sidebar-hint">Securely fetched with <PlaidLogo /></div>
          <div className="sidebar-nav">
            <Nav />
          </div>
          <div className="mt-2 grid gap-2.5 px-1 pb-1 pt-3">
            <BanksCard institutions={institutions} />
            <div className="footer-row"><ThemeToggle /><SettingsButton /></div>
          </div>
        </Drawer>

        <div className="canvas flex-1 rounded-[10px] bg-canvas [background-image:radial-gradient(var(--canvas-dot)_1px,transparent_1px)] [background-size:22px_22px]">
          {/* scroll-padding tracks the padding: Next scrolls a new page's first element into view
              inside this scroller, and padding alone would let it land flush against the top. */}
          <main className="canvas-inner p-3 [scroll-padding-top:12px] sm:p-6 sm:[scroll-padding-top:24px] lg:p-7 lg:[scroll-padding-top:28px]">{children}</main>
        </div>
      </div>
    </WindowManagerProvider>
  );
}
