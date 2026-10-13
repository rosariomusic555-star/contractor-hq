import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Search } from "lucide-react";
import { useGlobalSearch } from "@/components/search/search-context";
import { cn } from "@/lib/utils";
import { BackLink } from "@/components/common/BackLink";
import { ListBannerPhoneHeader, ListBannerPhoneTiles, type RichBanner } from "@/components/common/ListBanner";
import { useSimpleBanners } from "@/hooks/use-simple-banners";

/**
 * The slate `#687B85` block that tops every phone screen. Full-bleeds out of
 * the layout's `p-4` and sits under the notch. Hidden at `md+`. With `rich`
 * (a list page's banner data, see ListBanner) it adds the insight line and
 * attention chips, and the stat tiles as a swipeable row under it — unless
 * Customize › "Simple banners" is on.
 */
export function MobilePageHeader({
  title,
  subtitle,
  back,
  actions,
  pills,
  children,
  rich,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { to: string; label: string };
  actions?: ReactNode;
  pills?: ReactNode;
  children?: ReactNode;
  rich?: RichBanner;
  className?: string;
}) {
  // Owner screens only (the search lives in AppLayout).
  const search = useGlobalSearch();
  const [simple] = useSimpleBanners();
  const showRich = !!rich && !simple;
  return (
    <>
    <div className={cn("mobile-header -mx-4 -mt-4 mb-4 md:hidden", className)}>
      {back && (
        <BackLink
          to={back.to}
          className="mb-1 inline-flex items-center text-xs font-semibold text-sidebar-foreground/70"
        >{back.label}</BackLink>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-tight">{title}</h1>
          {subtitle != null && (
            <p className="mt-0.5 text-xs text-sidebar-foreground/70">{subtitle}</p>
          )}
        </div>
        {(actions != null || search) && (
          <div className="flex shrink-0 items-start gap-1">
            {actions}
            {search && (
              <button
                type="button"
                aria-label="Search"
                onClick={() => search.openSearch()}
                className="-mr-2 -mt-1 flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                <Search className="h-5 w-5" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
      {showRich && <ListBannerPhoneHeader rich={rich} />}
      {pills != null && <div className="mt-3 flex flex-wrap gap-2">{pills}</div>}
      {children}
    </div>
    {showRich && (
      <div className="md:hidden">
        <ListBannerPhoneTiles rich={rich} />
      </div>
    )}
    </>
  );
}
