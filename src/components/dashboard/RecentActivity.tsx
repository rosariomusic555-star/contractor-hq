import { FileText, Receipt, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Activity {
  id: string;
  type: "quote" | "invoice" | "payment";
  title: string;
  client: string;
  amount: string;
  status: "completed" | "pending" | "overdue";
  time: string;
}

const activities: Activity[] = [
  {
    id: "1",
    type: "payment",
    title: "Payment received",
    client: "Thompson Residence",
    amount: "$4,250.00",
    status: "completed",
    time: "2 hours ago"
  },
  {
    id: "2",
    type: "invoice",
    title: "Invoice sent",
    client: "Oak Street Renovation",
    amount: "$12,800.00",
    status: "pending",
    time: "5 hours ago"
  },
  {
    id: "3",
    type: "quote",
    title: "Quote approved",
    client: "Martinez Kitchen Remodel",
    amount: "$8,500.00",
    status: "completed",
    time: "1 day ago"
  },
  {
    id: "4",
    type: "invoice",
    title: "Invoice overdue",
    client: "Downtown Office Build",
    amount: "$24,000.00",
    status: "overdue",
    time: "3 days ago"
  },
];

const iconMap = {
  quote: FileText,
  invoice: Receipt,
  payment: CheckCircle,
};

const statusConfig = {
  completed: { icon: CheckCircle, class: "text-success" },
  pending: { icon: Clock, class: "text-warning" },
  overdue: { icon: AlertCircle, class: "text-destructive" },
};

export function RecentActivity() {
  return (
    <div className="stat-card">
      <h3 className="text-lg font-semibold text-foreground mb-4">Recent Activity</h3>
      <div className="space-y-4">
        {activities.map((activity) => {
          const Icon = iconMap[activity.type];
          const StatusIcon = statusConfig[activity.status].icon;
          
          return (
            <div key={activity.id} className="flex items-start gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="p-2 rounded-lg bg-muted">
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{activity.title}</p>
                  <StatusIcon className={cn("w-4 h-4", statusConfig[activity.status].class)} />
                </div>
                <p className="text-sm text-muted-foreground">{activity.client}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">{activity.amount}</p>
                <p className="text-xs text-muted-foreground">{activity.time}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
