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
import { useBannerBeside } from "@/components/common/bannerPresence";
import { useAssistant } from "@/components/assistant/assistant-context";

const navRow =
  "flex w-full items-center gap-[10px] rounded-[10px] px-[11px] py-[9px] text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted/50";
const navRowActive =
  "bg-primary/[0.18] font-semibold text-foreground shadow-[inset_3px_0_0_hsl(var(--primary))] hover:bg-primary/[0.18]";

export function Sidebar() {
  const { setOpen: setAssistantOpen } = useAssistant();
  const [classic] = useClassicSidebarHeader();
  const headerRef = useRef<HTMLDivElement>(null);
  // The nav panel's tucked-in corner only while a page banner's slate is
  // beside it (none on most pages, or once the banner has scrolled away).
  const corner = useBannerBeside(headerRef, !classic);

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
    // Slate header continuing the page banner to the screen's left edge (same
    // --banner token, no border or seam), then the white nav panel. The aside
    // itself is slate so the panel's rounded corner shows slate behind it.
    <aside className="hidden md:flex fixed left-0 top-0 z-30 h-screen w-[276px] flex-col bg-banner">
      {/* Company row: its name sits on the banner's date line (banner top
          padding 20px; the 36px row is centred on that line). */}
      <div ref={headerRef} className="px-3 pb-[15px] pt-3">
        <div className="flex items-center gap-[11px] px-[6px]">
          <SidebarCompany onSlate />
          <NotificationsBell onSlate />
        </div>
        <div className="mt-3">
          <SidebarSearch onSlate />
        </div>
      </div>

      <div className={cn("flex min-h-0 flex-1 flex-col border-r border-border bg-card transition-[border-radius] duration-200", corner && "rounded-tr-[20px]")}>
        <div className="pt-1.5" />
        {nav}

        {/* User section */}
        <SidebarUser />
      </div>
    </aside>
  );
}
