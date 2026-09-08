import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/common/StatusPill";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { getProject, listQuotes, createQuote, quoteTotal } from "@/lib/api";
import { quoteStatusMeta } from "@/lib/statusMeta";

export function ProjectQuotesView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const {
    data: quotes = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["quotes", { project: id }],
    queryFn: () => listQuotes(id),
  });

  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  // Auto-populate the client from the project, if it has one — the
  // contractor can still change it inside the quote builder.
  const addMut = useMutation({
    mutationFn: () => createQuote({ project_id: id, client_id: project?.client_id ?? null }),
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: ["quotes", { project: id }] });
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate(`/projects/${id}/quotes/${quote.id}`);
    },
    onError,
  });

  if (isLoading) return <p className="text-muted-foreground">Loading quotes…</p>;
  if (isError || !project)
    return <p className="text-destructive">Failed to load quotes: {(error as Error)?.message}</p>;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <Link
        to={`/projects/${id}`}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to project
      </Link>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">Quotes</h1>
          <p className="text-muted-foreground mt-1">{project.name}</p>
        </div>
        <Button
          onClick={() => addMut.mutate()}
          disabled={addMut.isPending}
          className="font-bold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add quote
        </Button>
      </div>

      {quotes.length === 0 ? (
        <div className="stat-card text-center py-12">
          <p className="text-muted-foreground">No quotes yet. Add your first quote.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {quotes.map((quote) => (
            <Link
              key={quote.id}
              to={`/projects/${id}/quotes/${quote.id}`}
              className="card-surface flex items-center justify-between gap-3 p-5 transition-shadow hover:shadow-card-hover"
            >
              <span className="font-bold text-foreground">
                {formatCurrency(quoteTotal(quote.quote_sections))}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                <StatusPill meta={quoteStatusMeta(quote.status)} />
                <ChevronRight className="h-4 w-4 text-muted-subtle" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
