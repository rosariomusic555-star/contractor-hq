import { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
  /** When set, the whole card is a link there, with a hover cue. */
  to?: string;
}

export function StatCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  iconColor = "text-primary",
  to,
}: StatCardProps) {
  const content = (
    <div className="flex items-start justify-between">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-3xl font-bold text-foreground">{value}</p>
        {change && (
          <p className={cn(
            "text-sm font-medium",
            changeType === "positive" && "text-success",
            changeType === "negative" && "text-destructive",
            changeType === "neutral" && "text-muted-foreground"
          )}>
            {change}
          </p>
        )}
      </div>
      <div className={cn("p-3 rounded-xl bg-muted", iconColor)}>
        <Icon className="w-6 h-6" />
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="stat-card block hover:shadow-md transition-shadow">
        {content}
      </Link>
    );
  }

  return <div className="stat-card">{content}</div>;
}
