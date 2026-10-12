import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { useQuery } from "@tanstack/react-query";
import { getBusinessProfile, listCrews } from "@/lib/api";
import { pluralize } from "@/lib/utils";
import { SETTINGS_GROUPS as GROUPS } from "./settingsLinks";


/** "Company · N crews" from the real business profile + crews; a link to
 * set up the profile when there's no company name yet. */
function SettingsSubtitle() {
  const { data: profile, isLoading } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });
  const { data: crews = [] } = useQuery({ queryKey: ["crews"], queryFn: listCrews });
  if (isLoading) return null;
  const name = profile?.company_name?.trim();
  const crewCount = crews.length > 0 ? ` · ${pluralize(crews.length, "crew")}` : "";
  if (!name) {
    return (
      <>
        <Link to="/settings/business-profile" className="font-semibold underline underline-offset-2">
          Set up your business profile
        </Link>
        {crewCount}
      </>
    );
  }
  return <>{name}{crewCount}</>;
}

export function SettingsView() {
  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-6">
      <MobilePageHeader title="Settings" subtitle={<SettingsSubtitle />} />
      <PageHeader title="Settings" subtitle={<SettingsSubtitle />} />

      {GROUPS.map((group) => {
        const headingId = `settings-group-${group.title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
        return (
          <section key={group.title} aria-labelledby={headingId}>
            <h2 id={headingId} className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-subtle">
              {group.title}
            </h2>
            <nav className="card-surface divide-y divide-hairline">
              {group.items.map((s) => (
                <Link
                  key={s.to}
                  to={s.to}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/50"
                >
                  {s.label}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
                </Link>
              ))}
            </nav>
          </section>
        );
      })}
    </div>
  );
}
