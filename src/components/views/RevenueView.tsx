import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { RevenueReportView } from "@/components/revenue-report/RevenueReportView";

/** Revenue: the revenue & profitability report (RevenueReportView). */
export function RevenueView() {
  return (
    <div className="animate-fade-in space-y-4">
      <MobilePageHeader title="Revenue" subtitle="Sold, billed, collected and earned" />
      <div className="hidden md:block">
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Revenue</h1>
        <p className="mt-1 text-muted-foreground">What you sold, billed, collected and earned — and where it came from.</p>
      </div>
      <RevenueReportView />
    </div>
  );
}
