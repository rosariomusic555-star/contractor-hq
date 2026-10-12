import { createContext, forwardRef, useContext, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/common/BackLink";
import { BleedBanner } from "@/components/common/BleedBanner";
import { BANNER_PRIMARY, BANNER_SECONDARY } from "@/components/common/bannerStyles";
import { useClassicPageHeaders } from "@/hooks/use-classic-page-headers";
import { cn } from "@/lib/utils";

type Variant = "banner" | "plain";

const VariantContext = createContext<Variant>("plain");

/**
 * Desktop / tablet page header for list pages. Hidden below `md` (phone
 * screens use `MobilePageHeader`).
 *
 * - `banner` (default): the Dashboard's full-bleed slate band (BleedBanner —
 *   so the sidebar header's slate and company-row split follow it, like on
 *   the Dashboard). White title (32px, centred on the sidebar's company row)
 *   and subtitle, actions on the right (`HeaderButton`). `kpis` (KpiCard /
 *   StatTile tiles) straddle the banner's bottom edge like the Dashboard
 *   tiles; without them the band ends 24px below the title. Must be the
 *   page's first visible element on md+ (it pulls itself up over the main
 *   padding, overriding any space-y margin).
 * - `plain`: the old title row on the page background, KPIs in a grid below.
 *
 * Without a `variant` prop it follows Customize › "Classic page headers".
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  kpis,
  variant,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  /** Headline tiles (KpiCard) — in the banner, straddling its bottom edge. */
  kpis?: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  const [classic] = useClassicPageHeaders();
  const v: Variant = variant ?? (classic ? "plain" : "banner");

  if (v === "plain") {
    return (
      <VariantContext.Provider value="plain">
        {back && (
          <div className="hidden md:block">
            <BackLink to={back.to} className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
              {back.label}
            </BackLink>
          </div>
        )}
        <div className={cn("hidden items-end justify-between gap-5 md:flex", className)}>
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold leading-tight tracking-tight text-foreground">{title}</h1>
            {subtitle != null && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {actions != null && <div className="flex shrink-0 gap-2.5">{actions}</div>}
        </div>
        {kpis != null && <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4">{kpis}</div>}
      </VariantContext.Provider>
    );
  }

  return (
    <VariantContext.Provider value="banner">
      {/* -mt (important): flush with the top over the main padding, whatever
          space-y margin the page's wrapper gives its second child. */}
      <div className={cn("hidden md:block md:!-mt-6 lg:!-mt-8", className)}>
        <BleedBanner
          label={typeof title === "string" ? title : undefined}
          className={cn("mt-0 pt-3 md:mt-0 md:pt-3 lg:mt-0", kpis != null ? "pb-[84px] md:pb-[84px]" : "pb-6 md:pb-6")}
        >
          {back && (
            <BackLink to={back.to} className="mb-1 inline-flex items-center text-xs font-semibold text-banner-foreground/80 hover:text-banner-foreground">
              {back.label}
            </BackLink>
          )}
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              {/* 36px line, 12px from the top: centred on the sidebar's
                  company row (30px). */}
              <h1 className="text-[32px] font-bold leading-9 tracking-tight">{title}</h1>
              {subtitle != null && (
                <p className="mt-1 text-sm text-banner-foreground/80 [&_.text-foreground]:text-banner-foreground [&_a]:text-banner-foreground">{subtitle}</p>
              )}
            </div>
            {actions != null && <div className="flex shrink-0 flex-wrap justify-end gap-2">{actions}</div>}
          </div>
        </BleedBanner>
        {kpis != null && <div className="relative z-[1] -mt-16 grid grid-cols-2 gap-4 xl:grid-cols-4">{kpis}</div>}
      </div>
    </VariantContext.Provider>
  );
}

/**
 * An action in a PageHeader: on the banner, the Dashboard's light-green
 * filled button (`primary`) or outlined white (`secondary`); in the plain
 * header, the normal filled / outline Button.
 */
export const HeaderButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "secondary"; asChild?: boolean }
>(function HeaderButton({ kind = "primary", asChild = false, className, ...props }, ref) {
  const v = useContext(VariantContext);
  if (v === "plain") {
    return <Button ref={ref} asChild={asChild} variant={kind === "primary" ? "default" : "outline"} className={cn("font-bold", className)} {...props} />;
  }
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(kind === "primary" ? BANNER_PRIMARY : BANNER_SECONDARY, className)} {...props} />;
});
