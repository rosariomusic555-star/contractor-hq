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
  Layers,
  Wallet,
  Clock,
  Activity,
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
  { to: "/materials", label: "Cost Plans", icon: Layers },
  { to: "/quotes", label: "Quotes", icon: FileText },
  { to: "/invoices", label: "Invoices", icon: Receipt },
  { to: "/expenses", label: "Expenses", icon: Wallet },
  { to: "/timesheets", label: "Timesheets", icon: Clock },
  { to: "/revenue", label: "Revenue", icon: TrendingUp },
  { to: "/business-health", label: "Business health", icon: Activity },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
];

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const byTo = (to: string) => navItems.find((item) => item.to === to)!;

// Sidebar-only grouping of navItems into labeled sections (desktop Sidebar).
// BottomTabBar and its "More" sheet intentionally keep their own flat list.
export const navGroups: NavGroup[] = [
  { label: "Overview", items: ["/dashboard"].map(byTo) },
  { label: "Work", items: ["/projects", "/materials", "/quotes", "/invoices", "/expenses", "/timesheets"].map(byTo) },
  { label: "Pipeline", items: ["/pipeline", "/tasks", "/appointments", "/communications"].map(byTo) },
  { label: "Money", items: ["/revenue", "/business-health"].map(byTo) },
  { label: "Business", items: ["/clients", "/settings"].map(byTo) },
];
