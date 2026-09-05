import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getQuote } from "@/lib/api";
import { QuoteWorkspace } from "./QuoteWorkspace";

/** Same quote builder as QuoteDetailView, just entered from a project's own
 * quotes list — the only difference is where "back" points. */
export function ProjectQuoteDetailView() {
  const { id = "", quoteId = "" } = useParams();

  const {
    data: quote,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ["quote", quoteId], queryFn: () => getQuote(quoteId) });

  if (isLoading) return <p className="text-muted-foreground">Loading quote…</p>;
  if (isError || !quote)
    return <p className="text-destructive">Failed to load quote: {(error as Error)?.message}</p>;

  return (
    <QuoteWorkspace quote={quote} backHref={`/projects/${id}/quotes`} backLabel="Back to quotes" />
  );
}
