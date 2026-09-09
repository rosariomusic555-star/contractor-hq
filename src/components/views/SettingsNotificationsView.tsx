import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { DEMO_AUTOMATIONS } from "@/lib/demoData";

const CHANNELS = [
  { id: "email", label: "Email", enabled: true },
  { id: "sms", label: "Text message", enabled: false },
  { id: "push", label: "Push notification", enabled: true },
] as const;

export function SettingsNotificationsView() {
  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Notifications" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <Link
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Settings
        </Link>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Notifications</h1>
      </div>

      <section className="card-surface p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Automations</h2>
        <div className="mt-2 divide-y divide-hairline">
          {DEMO_AUTOMATIONS.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-4 py-3.5">
              <div>
                <div className="text-sm font-semibold text-foreground">{a.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{a.description}</div>
              </div>
              <Switch defaultChecked={a.enabled} />
            </div>
          ))}
        </div>
      </section>

      <section className="card-surface p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Notify me by</h2>
        <div className="mt-2 divide-y divide-hairline">
          {CHANNELS.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-4 py-3.5">
              <div className="text-sm font-semibold text-foreground">{c.label}</div>
              <Switch defaultChecked={c.enabled} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
