import { Link } from "react-router-dom";
import { ChevronLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { DEMO_CREWS } from "@/lib/demoData";

/** Placeholder — crews are demo-only (DEMO_CREWS); no team/crew table exists. */
export function SettingsTeamView() {
  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Team & crews" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <Link
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Settings
        </Link>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Team & crews</h1>
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center justify-between bg-sidebar px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
              <Users className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-bold text-background">Crews</span>
          </div>
          <span className="text-xs font-semibold text-background/70">{DEMO_CREWS.length} crews</span>
        </div>

        <div className="divide-y divide-hairline bg-card px-5">
          {DEMO_CREWS.map((crew) => (
            <div key={crew.id} className="flex items-center justify-between gap-4 py-3.5">
              <div>
                <div className="text-sm font-semibold text-foreground">{crew.name}</div>
                <div className="text-xs text-muted-foreground">Led by {crew.lead}</div>
              </div>
              <div className="text-sm font-bold tabular-nums text-foreground">
                {crew.size} {crew.size === 1 ? "person" : "people"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button className="h-11 rounded-xl font-bold">Invite teammate</Button>
      </div>
    </div>
  );
}
