import type { ProjectStatus } from "./api";

interface StatusMeta {
  label: string;
  badge: string;
}

export const PROJECT_STATUS_META: Record<ProjectStatus, StatusMeta> = {
  draft: { label: "Draft", badge: "badge-status badge-draft" },
  quote_sent: { label: "Quote sent", badge: "badge-status badge-info" },
  approved: { label: "Approved", badge: "badge-status badge-paid" },
  invoiced: { label: "Invoiced", badge: "badge-status badge-pending" },
  paid: { label: "Paid", badge: "badge-status badge-paid-solid" },
};

export const PROJECT_STATUSES = Object.keys(PROJECT_STATUS_META) as ProjectStatus[];

/** Tolerates legacy / unexpected status strings without throwing. */
export function projectStatusMeta(status: string): StatusMeta {
  return (
    PROJECT_STATUS_META[status as ProjectStatus] ?? {
      label: status.replace(/_/g, " ") || "Unknown",
      badge: "badge-status badge-draft",
    }
  );
}
