import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { DEMO_CREWS } from "@/lib/demoData";

interface SettingsLink {
  label: string;
  to: string;
}

interface SettingsGroup {
  title: string;
  items: readonly SettingsLink[];
}

/**
 * Settings is grouped by what part of the business each page affects,
 * rather than one long list. Every page lives in exactly one group — add
 * new settings pages to the group they belong to (routes are unchanged;
 * this is only the index page's layout).
 */
const GROUPS: readonly SettingsGroup[] = [
  {
    title: "Business",
    items: [
      { label: "Business profile", to: "/settings/business-profile" },
      { label: "Overhead", to: "/settings/overhead" },
      { label: "Business health", to: "/settings/business-health" },
    ],
  },
  {
    title: "Sales & clients",
    items: [
      { label: "Lead sources", to: "/settings/lead-sources" },
      { label: "Messages", to: "/settings/messages" },
      { label: "Reviews", to: "/settings/reviews" },
      { label: "Portfolio", to: "/portfolio" },
    ],
  },
  {
    title: "Estimating & quotes",
    items: [
      { label: "Quote defaults", to: "/settings/quote-defaults" },
      { label: "Quick Quote rates", to: "/settings/quick-quote-rates" },
      { label: "Smart Section templates", to: "/settings/smart-sections" },
      { label: "Selection templates", to: "/settings/selection-templates" },
      { label: "Line item categories", to: "/settings/categories" },
      { label: "Estimating insights", to: "/settings/estimating-insights" },
    ],
  },
  {
    title: "Materials",
    items: [
      { label: "Price Book", to: "/settings/pricebook" },
      { label: "Material categories", to: "/settings/material-categories" },
      { label: "Suppliers", to: "/settings/suppliers" },
    ],
  },
  {
    title: "Jobs & scheduling",
    items: [
      { label: "Schedule & weather", to: "/settings/weather" },
      { label: "Pre-construction checklist", to: "/settings/precon" },
      { label: "Progress updates", to: "/settings/progress" },
      { label: "Maintenance reminders", to: "/settings/maintenance" },
    ],
  },
  {
    title: "Team & payroll",
    items: [
      { label: "Team & crews", to: "/settings/team" },
      { label: "Manage employees", to: "/settings/employees" },
      { label: "Payroll & time", to: "/settings/payroll" },
    ],
  },
  {
    title: "Money",
    items: [
      { label: "Invoicing & payments", to: "/settings/invoicing" },
      { label: "Expense categories", to: "/settings/expense-categories" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Notifications", to: "/settings/notifications" },
      { label: "Plan & billing", to: "/settings/billing" },
    ],
  },
];

export function SettingsView() {
  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-6">
      <MobilePageHeader title="Settings" subtitle={`Rossi Hardscape · ${DEMO_CREWS.length} crews`} />
      <PageHeader
        title="Settings"
        subtitle={`Rossi Hardscape · ${DEMO_CREWS.length} crews · pricebook updated Aug 30`}
      />

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
