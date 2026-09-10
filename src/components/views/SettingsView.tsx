import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { DEMO_CREWS } from "@/lib/demoData";

const SECTIONS = [
  { label: "Business profile", to: "/settings/business-profile" },
  { label: "Quote defaults", to: "/settings/quote-defaults" },
  { label: "Categories", to: "/settings/categories" },
  { label: "Invoicing & payments", to: "/settings/invoicing" },
  { label: "Pricebook & materials", to: "/settings/pricebook" },
  { label: "Team & crews", to: "/settings/team" },
  { label: "Notifications", to: "/settings/notifications" },
  { label: "Plan & billing", to: "/settings/billing" },
] as const;

export function SettingsView() {
  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Settings" subtitle={`Rossi Hardscape · ${DEMO_CREWS.length} crews`} />
      <PageHeader
        title="Settings"
        subtitle={`Rossi Hardscape · ${DEMO_CREWS.length} crews · pricebook updated Aug 30`}
      />

      <nav className="card-surface divide-y divide-hairline">
        {SECTIONS.map((s) => (
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
    </div>
  );
}
