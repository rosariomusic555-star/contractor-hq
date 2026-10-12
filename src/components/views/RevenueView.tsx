import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { PageHeader } from "@/components/common/PageHeader";
import { RevenueReportView } from "@/components/revenue-report/RevenueReportView";

/** Revenue: the revenue & profitability report (RevenueReportView). */
export function RevenueView() {
  return (
    <div className="animate-fade-in space-y-4">
      <MobilePageHeader title="Revenue" subtitle="Sold, billed, collected and earned" />
      <PageHeader title="Revenue" subtitle="What you sold, billed, collected and earned — and where it came from." />
      <RevenueReportView />
    </div>
  );
}
