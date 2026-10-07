import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { createChangeOrder, createProjectInvoice, getOrCreateCostPlan, type StandaloneQuoteConversion } from "@/lib/api";
import type { ProjectAction } from "@/lib/standaloneQuote";

/**
 * After a standalone quote becomes a project, carry on to the project-only
 * action the contractor had clicked (Create invoice, Record payment…) —
 * the same place that action lives on the project.
 */
export function useContinueProjectAction() {
  const navigate = useNavigate();
  const { toast } = useToast();
  return async (action: ProjectAction, result: StandaloneQuoteConversion) => {
    const base = `/projects/${result.project_id}`;
    try {
      switch (action) {
        case "deposit": {
          const id = result.deposit_invoice_id ?? (await createProjectInvoice(result.project_id, "deposit")).id;
          navigate(`${base}/invoices/${id}`);
          return;
        }
        case "invoice": {
          const invoice = await createProjectInvoice(result.project_id, "auto");
          navigate(`${base}/invoices/${invoice.id}`);
          return;
        }
        case "payment":
          navigate(`${base}?then=record-payment`);
          return;
        case "schedule":
          navigate(`${base}?then=schedule`);
          return;
        case "change_order": {
          const co = await createChangeOrder({ project_id: result.project_id });
          navigate(`${base}/change-orders/${co.id}`);
          return;
        }
        case "cost_plan":
          await getOrCreateCostPlan(result.project_id);
          navigate(`${base}/materials`);
          return;
      }
    } catch (err) {
      // The project exists either way — land there rather than nowhere.
      toast({ title: "Project created — finish that step there", description: (err as Error).message, variant: "destructive" });
      navigate(base);
    }
  };
}
