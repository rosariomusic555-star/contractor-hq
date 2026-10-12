import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronDown, CreditCard, Receipt, Settings, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { getBusinessProfile, getSignedImageUrls } from "@/lib/api";
import { cn } from "@/lib/utils";

/** "CleanGarden Landscaping" → "CL"; empty → "?". */
function companyMonogram(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const menuItems = [
  { label: "Business profile", to: "/settings/business-profile", icon: Building2 },
  { label: "Team & crews", to: "/settings/team", icon: Users },
  { label: "Invoicing & payments", to: "/settings/invoicing", icon: Receipt },
  { label: "Plan & billing", to: "/settings/billing", icon: CreditCard },
];

function CompanyBadge({ logoUrl, name, onSlate }: { logoUrl: string | null; name: string; onSlate?: boolean }) {
  if (logoUrl) {
    return (
      <div className={cn("flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-[10px] bg-white", onSlate ? "ring-1 ring-white/15" : "border border-hairline")}>
        <img src={logoUrl} alt="" className="h-full w-full object-contain" />
      </div>
    );
  }
  return (
    <div className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-foreground text-[13px] font-extrabold text-background", onSlate && "ring-1 ring-white/15")}>
      {companyMonogram(name)}
    </div>
  );
}

/** Top-of-sidebar company identity + company menu (settings shortcuts).
 *  `onSlate`: white text over the page banner. `large`: the 15px name of the
 *  banner-style sidebar header. `twin`: a look-only copy (no menu, not
 *  focusable) — the sidebar header draws a dark and a white one under the
 *  invisible real row; they mirror its hover / focus through the
 *  `group/hdr` wrapper. */
export function SidebarCompany({ onSlate = false, large = false, twin = false }: { onSlate?: boolean; large?: boolean; twin?: boolean }) {
  const navigate = useNavigate();
  const { data: profile, isLoading } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });
  const logoPath = profile?.logo_url ?? null;
  const { data: logoUrls = {} } = useQuery({
    queryKey: ["business-profile-logo-url", logoPath],
    queryFn: () => getSignedImageUrls([logoPath!]),
    enabled: !!logoPath,
  });
  const logoUrl = logoPath ? logoUrls[logoPath] ?? null : null;
  const name = profile?.company_name?.trim() ?? "";

  if (isLoading) {
    return (
      <div className="-my-1.5 -ml-2 flex min-w-0 flex-1 items-center gap-[11px] px-2 py-1.5">
        <Skeleton className={cn("h-9 w-9 flex-none rounded-[10px]", onSlate && "bg-white/20")} />
        <Skeleton className={cn("h-4 flex-1", onSlate && "bg-white/20")} />
      </div>
    );
  }

  const face = (
    <>
      <CompanyBadge logoUrl={logoUrl} name={name} onSlate={onSlate} />
      {name ? (
        <h1 className={cn("min-w-0 flex-1 truncate leading-tight", large ? "text-[15px] font-semibold" : "text-sm font-bold", onSlate ? "text-white" : "text-foreground")} title={twin ? undefined : name}>
          {name}
        </h1>
      ) : (
        <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", onSlate ? "text-white/80" : "text-muted-foreground")}>Set up your company</span>
      )}
      <ChevronDown
        className={cn(
          "h-4 w-4 flex-none",
          onSlate ? "text-white/80 group-hover:text-white" : "text-muted-foreground",
          twin && (onSlate ? "group-has-[.chq-company:hover]/hdr:text-white" : "group-has-[.chq-company:hover]/hdr:text-foreground"),
        )}
      />
    </>
  );
  const row = "group -my-1.5 -ml-2 flex min-w-0 flex-1 items-center gap-[11px] rounded-lg px-2 py-1.5 text-left";

  if (twin) {
    return (
      <div
        className={cn(
          row,
          "group-has-[.chq-company:focus-visible]/hdr:ring-2",
          onSlate
            ? "group-has-[.chq-company:hover]/hdr:bg-white/10 group-has-[.chq-company:focus-visible]/hdr:ring-white/70"
            : "group-has-[.chq-company:hover]/hdr:bg-muted/50 group-has-[.chq-company:focus-visible]/hdr:ring-ring",
        )}
      >
        {face}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            row,
            "chq-company transition-colors",
            onSlate ? "hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70" : "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {face}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-[11px] font-normal">
          <CompanyBadge logoUrl={logoUrl} name={name} />
          <span className="min-w-0 truncate text-sm font-bold text-foreground" title={name || undefined}>
            {name || "Set up your company"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {menuItems.map((item) => (
          <DropdownMenuItem key={item.to} onSelect={() => navigate(item.to)}>
            <item.icon className="w-4 h-4 mr-2" />
            {item.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/settings")}>
          <Settings className="w-4 h-4 mr-2" />
          All settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
