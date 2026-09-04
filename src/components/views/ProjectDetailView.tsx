import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  getProject,
  listQuotes,
  listInvoices,
  listMaterials,
  updateProject,
  quoteTotal,
  materialsCogs,
  type ProjectStatus,
  type QuoteStatus,
} from "@/lib/api";
import { PROJECT_STATUS_META, PROJECT_STATUSES, projectStatusMeta } from "@/lib/projectStatus";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const quoteStatusLabel: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  approved: "Approved",
};

export function ProjectDetailView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: project, isLoading, isError, error } = useQuery({
    queryKey: ["projects", id],
    queryFn: () => getProject(id),
  });
  const { data: quotes = [] } = useQuery({
    queryKey: ["quotes", { project: id }],
    queryFn: () => listQuotes(id),
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices", { project: id }],
    queryFn: () => listInvoices(id),
  });
  const { data: materials = [] } = useQuery({
    queryKey: ["materials", { project: id }],
    queryFn: () => listMaterials(id),
  });

  const statusMutation = useMutation({
    mutationFn: (status: ProjectStatus) => updateProject(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't update status", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading project…</p>;
  if (isError || !project)
    return <p className="text-destructive">Failed to load project: {(error as Error)?.message}</p>;

  const materialsSummary =
    materials.length === 0
      ? "Not started"
      : `${plural(materials.length, "section")} · ${formatCurrency(materialsCogs(materials))} total cost`;

  const quoteSummary =
    quotes.length === 0
      ? "Not started"
      : `${quoteStatusLabel[quotes[0].status]} · ${formatCurrency(quoteTotal(quotes[0].quote_sections))} total`;

  const invoicesTotal = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const invoicesSummary =
    invoices.length === 0
      ? "None yet"
      : `${plural(invoices.length, "invoice")} · ${money(invoicesTotal)}`;

  const meta = projectStatusMeta(project.status);

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <Link
        to="/projects"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Projects
      </Link>

      <div className="space-y-3">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">{project.name}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground">{project.client?.name ?? "No client"}</span>
          <span className={meta.badge}>{meta.label}</span>
          <Select
            value={project.status}
            onValueChange={(v) => statusMutation.mutate(v as ProjectStatus)}
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {PROJECT_STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HubCard
          title="Materials sheet"
          summary={materialsSummary}
          onOpen={() => navigate(`/projects/${id}/materials`)}
        />
        <HubCard
          title="Quote"
          summary={quoteSummary}
          onOpen={() => navigate(`/projects/${id}/quote`)}
        />
        <HubCard
          title="Invoices"
          summary={invoicesSummary}
          onOpen={() => navigate(`/projects/${id}/invoices`)}
        />
      </div>
    </div>
  );
}

function HubCard({
  title,
  summary,
  onOpen,
}: {
  title: string;
  summary: string;
  onOpen: () => void;
}) {
  return (
    <div className="stat-card flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground flex-1">{summary}</p>
      <Button variant="outline" size="sm" className="self-start" onClick={onOpen}>
        Open
      </Button>
    </div>
  );
}
