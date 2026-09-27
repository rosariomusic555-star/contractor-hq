import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { PortalProjectDetail } from "@/lib/portalApi";
import { downloadProjectSummary } from "@/lib/projectSummaryPdf";

/** "Download project summary" (0113) — the client's (Client Hub) and the
 * contractor's (project page) copy are the same PDF from the same data. */
export function DownloadSummaryButton({
  detail,
  loadDetail,
  getLogoUrl,
  className,
  variant = "outline",
  label = "Download project summary",
}: {
  /** Already-loaded Hub payload, or… */
  detail?: PortalProjectDetail | null;
  /** …fetched on tap (the project page doesn't load it otherwise). */
  loadDetail?: () => Promise<PortalProjectDetail | null>;
  getLogoUrl?: (path: string) => Promise<string | null>;
  className?: string;
  variant?: ButtonProps["variant"];
  label?: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      // With the payload already loaded (the Hub), the iOS tab opens on the
      // tap itself; fetched first (project page), iOS may fall back to
      // opening the PDF in the current tab.
      const d = detail ?? (loadDetail ? await loadDetail() : null);
      if (!d) throw new Error("Project not available");
      const logoPath = d.business.logo_url;
      await downloadProjectSummary(d, logoPath && getLogoUrl ? () => getLogoUrl(logoPath) : undefined);
    } catch (err) {
      toast({ title: "Couldn't build the summary", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button type="button" variant={variant} className={className} onClick={() => void run()} disabled={busy}>
      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
      {label}
    </Button>
  );
}
