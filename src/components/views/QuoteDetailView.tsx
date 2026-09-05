import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getQuote } from "@/lib/api";
import { QuoteWorkspace } from "./QuoteWorkspace";

/** Direct route to a single quote (/quotes/:quoteId) — the single place a
 * quote is ever edited, whether it's standalone or linked to a project.
 * QuoteWorkspace derives everything it needs (project, client) straight
 * from the quote itself, so this wrapper only needs the quote. */
export function QuoteDetailView() {
  const { quoteId = "" } = useParams();

  const {
    data: quote,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["quote", quoteId],
    queryFn: () => getQuote(quoteId),
    enabled: quoteId.length > 0,
  });

  if (isLoading) {
    return <p className="text-muted-foreground">Loading quote…</p>;
  }
  if (isError || !quote) {
    return <p className="text-destructive">Failed to load quote: {(error as Error)?.message}</p>;
  }

  return <QuoteWorkspace quote={quote} backHref="/quotes" backLabel="Back to quotes" />;
}
