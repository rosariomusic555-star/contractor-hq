import { useQuery } from "@tanstack/react-query";
import { Crown, Repeat, UserPlus, Users } from "lucide-react";
import type { RichBanner } from "@/components/common/ListBanner";
import { listMaintenanceItems, listOpportunities, type Client } from "@/lib/api";
import { dueBuckets } from "@/lib/maintenance";
import { changeLabel, count, inMonth, pct, repeatRate } from "@/lib/bannerMetrics";
import { formatCurrency } from "@/lib/utils";

export type ClientChip = "lead_no_opp" | "missing_contact" | "maintenance";
type ClientKind = "active" | "repeat" | "lead" | "client";
interface ClientStat {
  projects: number;
  revenue: number;
  kind: ClientKind;
}

export function clientBannerStats(
  clients: Pick<Client, "id" | "name" | "email" | "phone" | "created_at">[],
  statOf: (id: string) => ClientStat,
  oppClientIds: Set<string>,
  maintenanceClientIds: Set<string>,
  now: Date,
) {
  const match = (c: Pick<Client, "id" | "email" | "phone">, chip: ClientChip) => {
    switch (chip) {
      case "lead_no_opp":
        return statOf(c.id).kind === "lead" && !oppClientIds.has(c.id);
      case "missing_contact":
        return !c.email?.trim() || !c.phone?.trim();
      case "maintenance":
        return maintenanceClientIds.has(c.id);
    }
  };
  const top = clients.map((c) => ({ c, revenue: statOf(c.id).revenue })).sort((a, b) => b.revenue - a.revenue)[0];
  const chip = (k: ClientChip) => clients.filter((c) => match(c, k)).length;
  return {
    total: clients.length,
    active: clients.filter((c) => statOf(c.id).kind === "active").length,
    newMonth: clients.filter((c) => inMonth(c.created_at, now)).length,
    newLastMonth: clients.filter((c) => inMonth(c.created_at, now, -1)).length,
    repeat: repeatRate(clients.map((c) => statOf(c.id).projects)),
    top: top && top.revenue > 0 ? top : null,
    match,
    chips: { lead_no_opp: chip("lead_no_opp"), missing_contact: chip("missing_contact"), maintenance: chip("maintenance") },
  };
}

export function useClientsBanner({
  clients,
  statOf,
  loading,
  chip,
  setChip,
  filter,
  setFilter,
}: {
  clients: Client[];
  statOf: (id: string) => ClientStat;
  loading: boolean;
  chip: ClientChip | null;
  setChip: (c: ClientChip | null) => void;
  filter: string;
  setFilter: (f: "all" | "active" | "repeat" | "lead") => void;
}): { rich: RichBanner; matches: (c: Client) => boolean } {
  const { data: opportunities = [] } = useQuery({ queryKey: ["opportunities"], queryFn: listOpportunities });
  const { data: maint = [] } = useQuery({ queryKey: ["maintenance-items", "all"], queryFn: () => listMaintenanceItems() });
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const due = dueBuckets(maint, today);
  const maintenanceClientIds = new Set(
    [...due.overdue, ...due.thisMonth].filter((i) => i.project?.client_id && !i.project.client?.maintenance_opt_out).map((i) => i.project!.client_id!),
  );
  const oppClientIds = new Set(opportunities.map((o) => o.client_id).filter((x): x is string => !!x));
  const st = clientBannerStats(clients, statOf, oppClientIds, maintenanceClientIds, now);

  const insight =
    st.total === 0
      ? "No clients yet — add your first one"
      : [count(st.total, "client"), st.newMonth ? `${st.newMonth} new this month` : null, st.repeat != null ? `${pct(st.repeat)} come back for more work` : null].filter(Boolean).join(" · ");

  const go = (f: "all" | "active" | "repeat" | "lead") => {
    setChip(null);
    setFilter(f);
  };
  const rich: RichBanner = {
    insight,
    loading,
    listId: "clients-list",
    activeChip: chip,
    onChip: (k) => {
      setChip(k as ClientChip | null);
      if (k) setFilter("all");
    },
    chips: [
      { key: "lead_no_opp", label: st.chips.lead_no_opp === 1 ? "lead with no opportunity yet" : "leads with no opportunity yet", count: st.chips.lead_no_opp },
      { key: "missing_contact", label: "missing email or phone", count: st.chips.missing_contact },
      { key: "maintenance", label: "due for maintenance", count: st.chips.maintenance },
    ],
    tiles: [
      {
        key: "active",
        label: "Active clients",
        icon: Users,
        value: st.total ? String(st.active) : "—",
        sub: st.total ? "with a job scheduled or underway" : "Add your first client to see this",
        onClick: () => go("active"),
        active: !chip && filter === "active",
      },
      {
        key: "new",
        label: "New this month",
        icon: UserPlus,
        value: st.total ? String(st.newMonth) : "—",
        sub: changeLabel(st.newMonth, st.newLastMonth, "last month") ?? (st.newLastMonth === 0 && st.total ? "none last month" : "New clients show here"),
        onClick: () => go("all"),
      },
      {
        key: "repeat",
        label: "Repeat rate",
        icon: Repeat,
        value: st.repeat == null ? "—" : pct(st.repeat),
        sub: st.repeat == null ? "Clients with 2+ projects" : "of clients with a project have 2+",
        visual: st.repeat == null ? undefined : { kind: "progress", value: st.repeat },
        onClick: () => go("repeat"),
        active: !chip && filter === "repeat",
      },
      {
        key: "top",
        label: "Top client",
        icon: Crown,
        value: st.top ? st.top.c.name : "—",
        sub: st.top ? `${formatCurrency(st.top.revenue)} invoiced, all time` : "Shows once you've invoiced",
        to: st.top ? `/clients/${st.top.c.id}` : undefined,
      },
    ],
  };
  return { rich, matches: (c) => !chip || st.match(c, chip) };
}
