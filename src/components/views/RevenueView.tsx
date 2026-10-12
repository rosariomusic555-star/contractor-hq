import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { PageHeader } from "@/components/common/PageHeader";
import { RevenueReportView } from "@/components/revenue-report/RevenueReportView";
import { useRevenueBanner } from "@/components/banners/revenueBanner";

/** Revenue: the revenue & profitability report (RevenueReportView). */
export function RevenueView() {
  const rich = useRevenueBanner();
  return (
    <div className="animate-fade-in space-y-4">
      <MobilePageHeader rich={rich} title="Revenue" subtitle="Sold, billed, collected and earned" />
      <PageHeader rich={rich} title="Revenue" subtitle="What you sold, billed, collected and earned — and where it came from." />
      <RevenueReportView />
    </div>
  );
}
