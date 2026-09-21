import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getProject, getInvoice } from "@/lib/api";
import { InvoiceWorkspace } from "./InvoiceWorkspace";

/** Direct route to a single invoice (/invoices/:invoiceId) — same editor as
 * ProjectInvoiceDetailView, just entered from the cross-project Invoices
 * list instead of from a project, and without the project page around it.
 * Works equally for a standalone invoice (invoice.project_id is null) — no
 * project is ever fetched or required for one. */
export function InvoiceDetailView() {
  const { invoiceId = "" } = useParams();

  const {
    data: invoice,
    isLoading: isInvoiceLoading,
    isError: isInvoiceError,
    error,
  } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => getInvoice(invoiceId),
    enabled: invoiceId.length > 0,
  });

  const { isLoading: isProjectLoading } = useQuery({
    queryKey: ["projects", invoice?.project_id],
    queryFn: () => getProject(invoice!.project_id!),
    enabled: !!invoice?.project_id,
  });

  if (isInvoiceLoading || (!!invoice?.project_id && isProjectLoading)) {
    return <p className="text-muted-foreground">Loading invoice…</p>;
  }
  if (isInvoiceError || !invoice) {
    return <p className="text-destructive">Failed to load invoice: {(error as Error)?.message}</p>;
  }

  return (
    <InvoiceWorkspace
      invoice={invoice}
      projectId={invoice.project_id}
      backHref="/invoices"
      backLabel="Back to invoices"
    />
  );
}
