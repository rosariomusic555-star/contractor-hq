export interface SettingsLink {
  label: string;
  to: string;
}

export interface SettingsGroup {
  title: string;
  items: readonly SettingsLink[];
}

/**
 * Settings is grouped by what part of the business each page affects,
 * rather than one long list. Every page lives in exactly one group — add
 * new settings pages to the group they belong to (routes are unchanged;
 * this is only the index page's layout).
 */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    title: "Business",
    items: [
      { label: "Business profile", to: "/settings/business-profile" },
      { label: "Overhead", to: "/settings/overhead" },
      { label: "Business health", to: "/settings/business-health" },
    ],
  },
  {
    title: "Sales & clients",
    items: [
      { label: "Lead sources", to: "/settings/lead-sources" },
      { label: "Messages", to: "/settings/messages" },
      { label: "Reviews", to: "/settings/reviews" },
      { label: "Portfolio", to: "/portfolio" },
    ],
  },
  {
    title: "Estimating & quotes",
    items: [
      { label: "Project types", to: "/settings/project-types" },
      { label: "Quote defaults", to: "/settings/quote-defaults" },
      { label: "Quick Quote rates", to: "/settings/quick-quote-rates" },
      { label: "Smart Section templates", to: "/settings/smart-sections" },
      { label: "Selection templates", to: "/settings/selection-templates" },
      { label: "Estimating insights", to: "/settings/estimating-insights" },
    ],
  },
  {
    title: "Materials",
    items: [
      { label: "Price Book", to: "/settings/pricebook" },
      { label: "Material categories", to: "/settings/material-categories" },
      { label: "Suppliers", to: "/settings/suppliers" },
      { label: "Cost plan tax", to: "/settings/cost-plan-tax" },
    ],
  },
  {
    title: "Jobs & scheduling",
    items: [
      { label: "Schedule & weather", to: "/settings/weather" },
      { label: "Pre-construction checklist", to: "/settings/precon" },
      { label: "Progress updates", to: "/settings/progress" },
      { label: "Maintenance reminders", to: "/settings/maintenance" },
    ],
  },
  {
    title: "Team & payroll",
    items: [
      { label: "Team & crews", to: "/settings/team" },
      { label: "Manage employees", to: "/settings/employees" },
      { label: "Payroll & time", to: "/settings/payroll" },
    ],
  },
  {
    title: "Money",
    items: [
      { label: "Invoicing & payments", to: "/settings/invoicing" },
      { label: "Expense categories", to: "/settings/expense-categories" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "My profile", to: "/settings/profile" },
      { label: "Notifications", to: "/settings/notifications" },
      { label: "Plan & billing", to: "/settings/billing" },
    ],
  },
];
