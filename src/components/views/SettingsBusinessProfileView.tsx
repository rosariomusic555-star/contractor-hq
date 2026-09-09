import { Link } from "react-router-dom";
import { ChevronLeft, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { useAuth } from "@/lib/auth";

const FIELD_LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";
const FIELD_INPUT = "h-11 rounded-xl border-transparent bg-muted px-3.5 focus-visible:border-primary focus-visible:bg-card";

export function SettingsBusinessProfileView() {
  const { session } = useAuth();

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Business profile" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <Link
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Settings
        </Link>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Business profile</h1>
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center gap-3 bg-sidebar px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
            <Building2 className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-bold text-background">Company details</span>
        </div>

        <div className="grid grid-cols-1 gap-5 bg-card p-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>Company name</div>
            <Input id="companyName" defaultValue="Rossi Hardscape LLC" className={FIELD_INPUT} />
          </div>
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>Phone</div>
            <Input id="phone" defaultValue="(413) 555-0100" className={FIELD_INPUT} />
          </div>
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>Business email</div>
            <Input id="email" defaultValue="billing@rossihardscape.com" className={FIELD_INPUT} />
          </div>
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>License #</div>
            <Input id="license" defaultValue="MA HIC #187204" className={FIELD_INPUT} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <div className={FIELD_LABEL}>Address</div>
            <Input id="address" defaultValue="128 Pine St, Northampton MA 01060" className={FIELD_INPUT} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <div className={FIELD_LABEL}>Account email</div>
            <Input
              id="accountEmail"
              value={session?.user.email ?? ""}
              readOnly
              disabled
              className={FIELD_INPUT}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button className="h-11 rounded-xl font-bold">Save changes</Button>
      </div>
    </div>
  );
}
