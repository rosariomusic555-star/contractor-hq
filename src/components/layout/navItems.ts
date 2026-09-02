import {
  LayoutDashboard,
  FileText,
  Receipt,
  TrendingUp,
  Users,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/quotes", label: "Quotes", icon: FileText },
  { to: "/invoices", label: "Invoices", icon: Receipt },
  { to: "/revenue", label: "Revenue", icon: TrendingUp },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
];
