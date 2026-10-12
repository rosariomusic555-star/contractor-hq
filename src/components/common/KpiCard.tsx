import type { ComponentType, ReactNode } from "react";
import { StatTile } from "./StatTile";

type SubTone = "muted" | "positive" | "negative";

/**
 * "Label · big number · sub-line" card on the money screens — the Dashboard
 * tile look (StatTile): white card, border, soft shadow, optional icon chip.
 * Pass `clickable` when the card is wrapped in a link/button — adds a corner
 * chevron that nudges right on hover, so it reads as tappable rather than a
 * plain stat. List pages put a row of these in their banner (PageHeader
 * `kpis`), straddling its bottom edge.
 */
export function KpiCard({
  label,
  value,
  sub,
  subTone = "muted",
  icon,
  clickable = false,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  subTone?: SubTone;
  icon?: ComponentType<{ className?: string }>;
  clickable?: boolean;
  className?: string;
}) {
  return <StatTile label={label} value={value} sub={sub} subTone={subTone} icon={icon} clickable={clickable} className={className} />;
}
