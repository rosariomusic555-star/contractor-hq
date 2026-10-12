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
  const headerRef = useRef<HTMLDivElement>(null);
  // The page banner's bottom edge, relative to the header, as CSS variables
  // on the aside (--banner-edge / --banner-corner-top), updated every scroll
  // frame — see useBannerEdge.
  const hasBanner = useBannerEdge(asideRef, headerRef, !classic);

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
    // The header is see-through: the page's full-bleed banner (.bleed-banner)
    // runs under it to the screen's left edge, so the slate up there IS the
    // banner and scrolls with it pixel for pixel. Everything below the
    // banner's bottom edge (--banner-edge, from the header's top) is the white
    // header, so the split moves up through the header as you scroll:
    //   1. white background + right hairline, clipped to below the edge
    //   2. the real company row (dark), masked to below the edge — a mask, not
    //      a clip, so the whole row stays clickable
    //   3. a look-only white twin of the row, clipped to above the edge
    // Under the edge, at the right, a slate corner piece makes the white below
    // read as a rounded top-right corner; it moves with the banner (and off the
    // top with it), and the right hairline starts below its curve. The search
    // field has one style for both backgrounds and isn't split.
    <aside ref={asideRef} className="hidden md:flex fixed left-0 top-0 z-30 h-screen w-[276px] flex-col [--banner-corner-top:-20px] [--banner-edge:0px]">
      <div ref={headerRef} className="group/hdr relative">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-card [clip-path:inset(var(--banner-edge)_0_0_0)]" />
        {hasBanner && (
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-[var(--banner-corner-top)] h-5 w-5 bg-[radial-gradient(circle_at_bottom_left,transparent_20px,hsl(var(--banner))_20.5px)]"
          />
        )}
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

      <div className="flex min-h-0 flex-1 flex-col bg-card">
        <div className="pt-1.5" />
        {nav}

        {/* User section */}
        <SidebarUser />
      </div>

      {/* Right hairline: from under the corner piece's curve down. */}
      <div aria-hidden className="pointer-events-none absolute bottom-0 right-0 top-[calc(var(--banner-corner-top)+20px)] w-px bg-border" />
    </aside>
  );
}
