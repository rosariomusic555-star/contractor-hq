import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getProject, getInvoice } from "@/lib/api";
import { InvoiceWorkspace } from "./InvoiceWorkspace";

export function ProjectInvoiceDetailView() {
  const { id = "", invoiceId = "" } = useParams();

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const {
    data: invoice,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ["invoice", invoiceId], queryFn: () => getInvoice(invoiceId) });

  if (isLoading) return <p className="text-muted-foreground">Loading invoice…</p>;
  if (isError || !invoice || !project)
    return <p className="text-destructive">Failed to load invoice: {(error as Error)?.message}</p>;

  return (
    <InvoiceWorkspace
      invoice={invoice}
      projectId={id}
      backHref={`/projects/${id}/invoices`}
      backLabel="Back to invoices"
    />
  );
}
