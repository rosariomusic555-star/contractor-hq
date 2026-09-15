import {
  Briefcase,
  LayoutDashboard,
  FileText,
  Receipt,
  TrendingUp,
  Users,
  Settings,
  Kanban,
  ListChecks,
  CalendarClock,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pipeline", label: "Pipeline", icon: Kanban },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/appointments", label: "Appointments", icon: CalendarClock },
  { to: "/communications", label: "Communications", icon: MessagesSquare },
  { to: "/projects", label: "Projects", icon: Briefcase },
  { to: "/quotes", label: "Quotes", icon: FileText },
  { to: "/invoices", label: "Invoices", icon: Receipt },
  { to: "/revenue", label: "Revenue", icon: TrendingUp },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
];
