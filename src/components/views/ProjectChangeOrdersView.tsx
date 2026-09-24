import { useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/common/StatusPill";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, pluralize } from "@/lib/utils";
import { getProject, listChangeOrders, createChangeOrder, approvedChangeOrderTotal, type ChangeOrder } from "@/lib/api";
import { changeOrderStatusMeta } from "@/lib/statusMeta";
import { scheduleImpactLabel } from "@/lib/changeOrderImpact";
import { BackLink } from "@/components/common/BackLink";

const signedCurrency = (n: number) => (n > 0 ? `+${formatCurrency(n)}` : n < 0 ? `−${formatCurrency(Math.abs(n))}` : formatCurrency(0));
const amountColor = (n: number) => (n > 0 ? "text-success" : n < 0 ? "text-destructive" : "text-foreground");

/**
 * The project's change orders as a table — each one is a full Change
 * Order Builder document (ChangeOrderWorkspace.tsx) now, not a single-line
 * form entry. "CO-001" numbering is display-only (created-order index,
 * not a stored column) — same convention every other display-only
 * sequence in this app uses when nothing needs it to survive a delete.
 */
export function ProjectChangeOrdersView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const {
    data: changeOrders = [],
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ["change-orders", { project: id }], queryFn: () => listChangeOrders(id) });

  const numbered = useMemo(() => {
    const byCreated = [...changeOrders].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const numberById = new Map(byCreated.map((co, i) => [co.id, i + 1]));
    return [...changeOrders]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((co) => ({ co, number: numberById.get(co.id)! }));
  }, [changeOrders]);

  const approvedTotal = approvedChangeOrderTotal(changeOrders);
  const pendingTotal = changeOrders.filter((co) => co.status === "sent").reduce((s, co) => s + Number(co.amount), 0);
  const pendingCount = changeOrders.filter((co) => co.status === "sent").length;

  const createMut = useMutation({
    mutationFn: () => createChangeOrder({ project_id: id }),
    onSuccess: (co) => navigate(`/projects/${id}/change-orders/${co.id}`),
    onError: (err: Error) => toast({ title: "Couldn't create change order", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <BackLink to={`/projects/${id}`} className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">Back to project</BackLink>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">Change orders</h1>
          <p className="text-muted-foreground mt-1">{project?.name ?? " "}</p>
        </div>
        <Button onClick={() => createMut.mutate()} disabled={createMut.isPending} className="font-bold">
          <Plus className="mr-2 h-4 w-4" />
          {createMut.isPending ? "Creating…" : "New change order"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="font-bold text-foreground">
          Approved total: <span className={amountColor(approvedTotal)}>{signedCurrency(approvedTotal)}</span>
        </span>
        {pendingCount > 0 && (
          <span className="font-bold text-foreground">
            Pending total: <span className="text-muted-foreground">{signedCurrency(pendingTotal)}</span>{" "}
            <span className="font-normal text-muted-foreground">({pluralize(pendingCount, "change order")})</span>
          </span>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Loading change orders…</p>}
      {isError && <p className="text-destructive">Failed to load change orders: {(error as Error).message}</p>}

      {!isLoading && !isError && changeOrders.length === 0 && (
        <div className="stat-card text-center py-12">
          <p className="text-muted-foreground">No change orders yet.</p>
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending} className="mt-4 font-bold">
            <Plus className="mr-2 h-4 w-4" />
            New change order
          </Button>
        </div>
      )}

      {!isLoading && !isError && changeOrders.length > 0 && (
        <div className="card-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>CO #</th>
                  <th>Title</th>
                  <th>Amount</th>
                  <th>Schedule impact</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {numbered.map(({ co, number }) => (
                  <ChangeOrderRow key={co.id} co={co} number={number} projectId={id} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangeOrderRow({ co, number, projectId }: { co: ChangeOrder; number: number; projectId: string }) {
  const navigate = useNavigate();
  const meta = changeOrderStatusMeta(co.status);
  const amount = Number(co.amount);

  return (
    <tr className="cursor-pointer" onClick={() => navigate(`/projects/${projectId}/change-orders/${co.id}`)}>
      <td className="font-bold text-foreground">CO-{String(number).padStart(3, "0")}</td>
      <td className="text-foreground">{co.title || "Untitled change order"}</td>
      <td className={`font-bold tabular-nums whitespace-nowrap ${amountColor(amount)}`}>{signedCurrency(amount)}</td>
      <td className="text-muted-foreground">{scheduleImpactLabel(co.schedule_impact_days)}</td>
      <td>
        <StatusPill meta={meta} />
      </td>
      <td className="text-muted-foreground">{co.created_at.slice(0, 10)}</td>
    </tr>
  );
}
