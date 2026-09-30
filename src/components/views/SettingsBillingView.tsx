import { Link } from "react-router-dom";
import { ChevronLeft, CreditCard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { useQuery } from "@tanstack/react-query";
import { getBusinessProfile } from "@/lib/api";
import { BackLink } from "@/components/common/BackLink";

const FIELD_LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";
const FIELD_INPUT = "h-11 rounded-xl border-transparent bg-muted px-3.5 focus-visible:border-primary focus-visible:bg-card";

/** Placeholder — no billing/plan table or payment provider wired up yet. */
export function SettingsBillingView() {
  const { data: profile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Plan & billing" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <BackLink
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >Settings</BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Plan & billing</h1>
      </div>

      <section className="card-surface space-y-2 p-5 md:p-6">
        <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight text-foreground">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          Billing isn't set up yet
        </h2>
        <p className="text-sm text-muted-foreground">
          There's no subscription or payment method on this account. Your plan and billing details will show
          here once billing is available.
        </p>
      </section>

      <section className="card-surface space-y-1.5 p-5 md:p-6">
        <div className={FIELD_LABEL}>Billing email</div>
        <Input
          key={profile?.email ?? ""}
          defaultValue={profile?.email ?? ""}
          placeholder="Where billing emails should go"
          className={FIELD_INPUT}
        />
        <p className="text-xs text-muted-foreground">Defaults to your business profile email.</p>
      </section>
    </div>
  );
}
