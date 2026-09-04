import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getProject, getQuote } from "@/lib/api";
import { QuoteWorkspace } from "./QuoteWorkspace";

/** Direct route to a single quote (/quotes/:quoteId) — same editor as
 * ProjectQuoteView, just entered from the cross-project Quotes list instead
 * of from a project, and without the project page around it. */
export function QuoteDetailView() {
  const { quoteId = "" } = useParams();

  const {
    data: quote,
    isLoading: isQuoteLoading,
    isError: isQuoteError,
    error,
  } = useQuery({
    queryKey: ["quote", quoteId],
    queryFn: () => getQuote(quoteId),
    enabled: quoteId.length > 0,
  });

  const { data: project, isLoading: isProjectLoading } = useQuery({
    queryKey: ["projects", quote?.project_id],
    queryFn: () => getProject(quote!.project_id),
    enabled: !!quote?.project_id,
  });

  if (isQuoteLoading || (!!quote && isProjectLoading)) {
    return <p className="text-muted-foreground">Loading quote…</p>;
  }
  if (isQuoteError || !quote || !project) {
    return <p className="text-destructive">Failed to load quote: {(error as Error)?.message}</p>;
  }

  return (
    <QuoteWorkspace
      quote={quote}
      projectId={quote.project_id}
      projectName={project.name}
      backHref="/quotes"
      backLabel="Back to quotes"
    />
  );
}
