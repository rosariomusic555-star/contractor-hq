import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getProject, getQuote } from "@/lib/api";
import { QuoteWorkspace } from "./QuoteWorkspace";

export function ProjectQuoteDetailView() {
  const { id = "", quoteId = "" } = useParams();

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const {
    data: quote,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ["quote", quoteId], queryFn: () => getQuote(quoteId) });

  if (isLoading) return <p className="text-muted-foreground">Loading quote…</p>;
  if (isError || !quote || !project)
    return <p className="text-destructive">Failed to load quote: {(error as Error)?.message}</p>;

  return (
    <QuoteWorkspace
      quote={quote}
      projectId={id}
      projectName={project.name}
      backHref={`/projects/${id}/quotes`}
      backLabel="Back to quotes"
    />
  );
}
