import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { useRef } from "react";
import { NavLink } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarUser } from "./SidebarUser";
import { SidebarCompany } from "./SidebarCompany";
import { SidebarSearch } from "@/components/search/SidebarSearch";
import { navGroups } from "./navItems";
import { useClassicSidebarHeader } from "@/hooks/use-classic-sidebar-header";
import { useBandProgressFallback, useBannerPresent } from "@/components/common/bannerPresence";
import { useAssistant } from "@/components/assistant/assistant-context";

const navRow =
  "flex w-full items-center gap-[10px] rounded-[10px] px-[11px] py-[9px] text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted/50";
const navRowActive =
  "bg-primary/[0.18] font-semibold text-foreground shadow-[inset_3px_0_0_hsl(var(--primary))] hover:bg-primary/[0.18]";

export function Sidebar() {
  const { setOpen: setAssistantOpen } = useAssistant();
  const [classic] = useClassicSidebarHeader();
  const asideRef = useRef<HTMLElement>(null);
  const hasBanner = useBannerPresent() && !classic;
  useBandProgressFallback(asideRef, hasBanner);

  const nav = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="px-[11px] pb-1 pt-3.5 text-[10px] font-bold uppercase tracking-wide text-muted-subtle">
            {group.label}
          </p>
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(navRow, isActive && navRowActive)}
            >
              <item.icon className="h-[18px] w-[18px] flex-none" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      ))}
      <button type="button" onClick={() => setAssistantOpen(true)} className={cn(navRow, "mt-3.5")}>
        <Sparkles className="h-[18px] w-[18px] flex-none" />
        <span>Ask AI</span>
      </button>
    </nav>
  );

  if (classic) {
    // Customize › Classic sidebar header: the white header.
    return (
      <aside className="hidden md:flex fixed left-0 top-0 z-30 h-screen w-[276px] flex-col bg-card border-r border-border">
        {/* z-30: above page content — full-bleed bands (.bleed-banner) run
            under the sidebar, and the page's fade-in transform would
            otherwise paint them on top of it. */}
        {/* Company */}
        <div className="flex items-center gap-[11px] px-[18px] py-5">
          <SidebarCompany />
          <NotificationsBell />
        </div>

        {/* Search (opens the ⌘K dialog) */}
        <div className="px-3 pb-1">
          <SidebarSearch />
        </div>

        {nav}

        {/* User section */}
        <SidebarUser />
      </aside>
    );
  }

  const companyRow = (look: "dark" | "white") => (
    <div className="flex items-center gap-[11px] px-[6px]">
      <SidebarCompany large twin onSlate={look === "white"} />
      <NotificationsBell twin onSlate={look === "white"} />
    </div>
  );

  return (
    // The header is see-through: the page's full-bleed banner (.bleed-banner,
    // to the screen's left and top edges) shows behind it, so the slate there
    // IS the banner and scrolls with it by construction; below the banner the
    // app's page background shows. Nothing in the sidebar moves on scroll —
    // the white nav panel keeps its place and its rounded corner.
    //
    // Company row: the real (interactive) row is invisible, on top; under it
    // two look-only copies, dark and white, are revealed above / below the
    // banner's bottom edge in CSS (.band-under / .band-over, index.css) from
    // the banner's view timeline — compositor transforms, in step with the
    // scroll. The copies mirror the real row's hover and focus (group/hdr).
    <aside ref={asideRef} className="hidden md:flex fixed left-0 top-0 z-30 h-screen w-[276px] flex-col">
      <div className="group/hdr relative">
        <div aria-hidden {...{ inert: "" }} className="band-under pointer-events-none absolute inset-x-0 top-0 h-[60px]">
          <div className="band-box h-full overflow-hidden">
            <div className="band-inner px-3 pt-3">{companyRow("dark")}</div>
          </div>
        </div>
        {hasBanner && (
          <div aria-hidden {...{ inert: "" }} className="band-over pointer-events-none absolute inset-x-0 top-0 h-[60px]">
            <div className="band-box h-full overflow-hidden">
              <div className="band-inner px-3 pt-3">{companyRow("white")}</div>
            </div>
          </div>
        )}
        {/* Company row: its name sits on the banner's date line (banner top
            padding 20px; the 36px row is centred on that line). */}
        <div className="relative px-3 pt-3 opacity-0">
          <div className="flex items-center gap-[11px] px-[6px]">
            <SidebarCompany large />
            <NotificationsBell />
          </div>
        </div>
        <div className="relative px-3 pb-[15px] pt-3">
          <SidebarSearch raised />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col rounded-tr-[20px] border-r border-t border-border bg-card">
        <div className="pt-1.5" />
        {nav}

        {/* User section */}
        <SidebarUser />
      </div>
    </aside>
  );
}
