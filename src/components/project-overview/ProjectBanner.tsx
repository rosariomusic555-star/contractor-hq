import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { MapPin, Pencil } from "lucide-react";
import { BackLink } from "@/components/common/BackLink";
import { formatCurrency } from "@/lib/utils";

/**
 * The project page's top banner — a slate block (the section-header colour) across the top of the
 * page, right above the tabs: back link, "Project · <status>", the name,
 * client · address and the first few feature chips (+N expands; the pencil
 * opens the existing picker on a light surface); on the right Contract value
 * + margin (open Money) and the status picker.
 *
 * `money` is left out for crews (EmployeeProjectDetailView) — they never see
 * prices. Once it scrolls away, PageTabs shows `ProjectBannerSlim` above the
 * sticky tabs.
 */
export function ProjectBanner({
  backTo,
  backLabel,
  name,
  statusLabel,
  client,
  address,
  featureNames = [],
  featureEditor,
  money,
  statusControl,
}: {
  backTo: string;
  backLabel: string;
  name: string;
  statusLabel: string;
  /** undefined hides the client part (crews can't read clients). */
  client?: { id: string; name: string } | null;
  address?: string | null;
  featureNames?: string[];
  featureEditor?: ReactNode;
  money?: { contract: number; margin: number | null; marginLabel: string; onOpen: () => void };
  statusControl?: ReactNode;
}) {
  const [allChips, setAllChips] = useState(false);
  const [editing, setEditing] = useState(false);
  const shown = allChips ? featureNames : featureNames.slice(0, 4);
  const more = featureNames.length - shown.length;
  const hasClientLine = client !== undefined || !!address;

  return (
    <header className="bg-banner -mx-4 -mt-4 rounded-b-2xl px-4 pb-4 pt-3 text-banner-foreground md:-mx-8 md:-mt-8 md:rounded-b-card md:px-8 md:pb-5 md:pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <BackLink to={backTo} className="min-h-8 text-xs font-semibold text-banner-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
              {backLabel}
            </BackLink>
            {/* Phones: the status picker rides on the back row. */}
            {statusControl && <div className="sm:hidden">{statusControl}</div>}
          </div>
          <p className="mt-1 hidden text-[11px] font-semibold uppercase tracking-wider text-banner-foreground sm:block">Project · {statusLabel}</p>
          <h1 className="mt-0.5 truncate text-xl font-bold tracking-tight sm:mt-1 md:text-[28px] md:leading-9">{name}</h1>
          {hasClientLine && (
            <p className="mt-0.5 flex min-w-0 items-center gap-x-1.5 text-[13px] font-semibold text-banner-foreground md:text-sm">
              {client !== undefined &&
                (client ? (
                  <Link to={`/clients/${client.id}`} className="shrink-0 font-semibold text-banner-foreground hover:underline">
                    {client.name}
                  </Link>
                ) : (
                  <span className="shrink-0">No client</span>
                ))}
              {address && (
                <span className="inline-flex min-w-0 items-center gap-1">
                  {client !== undefined && <span aria-hidden>·</span>}
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{address}</span>
                </span>
              )}
            </p>
          )}
          {featureEditor && (
            // Phones keep the banner short — chips are a desktop extra.
            <div className="mt-2.5 hidden flex-wrap items-center gap-1.5 sm:flex">
              {shown.map((n) => (
                <span key={n} className="rounded-full bg-black/[0.18] px-2.5 py-1 text-xs font-semibold">
                  {n}
                </span>
              ))}
              {more > 0 && (
                <button type="button" onClick={() => setAllChips(true)} className="min-h-7 rounded-full border border-dashed border-white/40 px-2.5 text-xs font-semibold text-banner-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                  +{more} more
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditing((e) => !e)}
                aria-expanded={editing}
                aria-label="Edit features"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-banner-foreground hover:bg-black/[0.18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {/* The existing picker, on a light surface so it stays readable. */}
          {editing && <div className="mt-2 hidden rounded-xl bg-card p-2 text-foreground sm:block md:w-2/3">{featureEditor}</div>}
        </div>

        {(money || statusControl) && (
          <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
            {money && (
              <div className="flex items-center gap-2.5 sm:flex-col sm:items-end sm:gap-1.5">
                <button type="button" onClick={money.onOpen} className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:text-right" title="Open Money">
                  <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-banner-foreground sm:block">Contract value</span>
                  <span className="block text-xl font-extrabold tabular-nums tracking-tight sm:text-[26px] sm:leading-8">{money.contract > 0 ? formatCurrency(money.contract) : "—"}</span>
                </button>
                {money.margin != null && (
                  <button
                    type="button"
                    onClick={money.onOpen}
                    className="rounded-full bg-banner-control px-2.5 py-1 text-xs font-bold tabular-nums text-banner-control-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:px-3 sm:text-sm"
                    title={`${money.marginLabel} — open Money`}
                  >
                    {Math.round(money.margin)}% <span className="font-semibold opacity-75">{money.marginLabel.toLowerCase()}</span>
                  </button>
                )}
              </div>
            )}
            {statusControl && <div className="hidden sm:block">{statusControl}</div>}
          </div>
        )}
      </div>
    </header>
  );
}

/** The banner, compacted: name + status, shown above the sticky tabs once the
 *  banner has scrolled away (PageTabs `title`, with `titleClassName`
 *  PROJECT_BANNER_SLIM_BLEED so it spans the banner's width). */
export function ProjectBannerSlim({ name, statusLabel }: { name: string; statusLabel: string }) {
  return (
    <div className="bg-banner flex min-w-0 items-center gap-2.5 px-4 py-2 text-banner-foreground md:rounded-b-xl md:px-8">
      <span className="truncate text-base font-bold">{name}</span>
      <BannerStatus label={statusLabel} />
    </div>
  );
}

/** A read-only status pill for the banner — white, like the status picker. */
export function BannerStatus({ label }: { label: string }) {
  return <span className="shrink-0 rounded-full bg-banner-control px-2.5 py-0.5 text-xs font-semibold text-banner-control-foreground">{label}</span>;
}

/** PageTabs `titleClassName` for ProjectBannerSlim — no padding, banner width. */
export const PROJECT_BANNER_SLIM_BLEED = "-mx-4 !py-0 md:-mx-8";
