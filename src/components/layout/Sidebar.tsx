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
import { useBannerEdge } from "@/components/common/bannerPresence";
import { useAssistant } from "@/components/assistant/assistant-context";

const navRow =
  "flex w-full items-center gap-[10px] rounded-[10px] px-[11px] py-[9px] text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted/50";
const navRowActive =
  "bg-primary/[0.18] font-semibold text-foreground shadow-[inset_3px_0_0_hsl(var(--primary))] hover:bg-primary/[0.18]";

export function Sidebar() {
  const { setOpen: setAssistantOpen } = useAssistant();
  const [classic] = useClassicSidebarHeader();
  const asideRef = useRef<HTMLElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  // The page banner's bottom edge, relative to the header zone, as a CSS
  // variable on the aside (--banner-edge), updated every scroll frame — see
  // useBannerEdge.
  const hasBanner = useBannerEdge(asideRef, zoneRef, !classic);

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

  return (
    // The layout never moves: company row, search and the white nav panel
    // (fixed 20px rounded top-right corner) sit where they load. Only the
    // background of the header zone changes with scroll. That zone runs from
    // the top down to 20px below the header (behind the panel's corner):
    //   1. the page background (so with no banner it matches the page and the
    //      corner reads as a card corner)
    //   2. slate, from the top down to the banner's bottom edge
    //      (--banner-edge, clamped to the zone), pixel for pixel, no easing
    // The company row is drawn twice and split at the same edge: the real
    // (dark) row masked to below it (a mask, not a clip, so it stays
    // clickable everywhere) and a look-only white twin clipped to above it.
    // The search field has one style for both backgrounds and isn't split.
    <aside ref={asideRef} className="hidden md:flex fixed left-0 top-0 z-30 h-screen w-[276px] flex-col [--banner-edge:0px]">
      <div className="group/hdr relative">
        <div ref={zoneRef} aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-5 top-0 bg-background">
          {hasBanner && <div className="absolute inset-x-0 top-0 h-[var(--banner-edge)] bg-banner" />}
        </div>
        {/* Company row: its name sits on the banner's date line (banner top
            padding 20px; the 36px row is centred on that line). */}
        <div className="relative px-3 pt-3 [mask-image:linear-gradient(to_bottom,transparent_var(--banner-edge),#000_var(--banner-edge))]">
          <div className="flex items-center gap-[11px] px-[6px]">
            <SidebarCompany large />
            <NotificationsBell />
          </div>
        </div>
        {hasBanner && (
          <div
            aria-hidden
            {...{ inert: "" }}
            className="pointer-events-none absolute inset-x-0 top-0 px-3 pt-3 [clip-path:inset(0_0_calc(100%-var(--banner-edge))_0)]"
          >
            <div className="flex items-center gap-[11px] px-[6px]">
              <SidebarCompany onSlate large twin />
              <NotificationsBell onSlate twin />
            </div>
          </div>
        )}
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
