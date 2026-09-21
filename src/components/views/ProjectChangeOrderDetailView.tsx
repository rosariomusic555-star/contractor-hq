import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getChangeOrder } from "@/lib/api";
import { ChangeOrderWorkspace } from "./ChangeOrderWorkspace";

/** Entry point for the Change Order Builder — fetches the full itemized
 * change order (sections/items/photos) and hands it to the builder, same
 * "route just fetches, builder does everything else" shape as
 * ProjectQuoteDetailView/QuoteWorkspace. */
export function ProjectChangeOrderDetailView() {
  const { id = "", coId = "" } = useParams();

  const {
    data: changeOrder,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ["change-order", coId], queryFn: () => getChangeOrder(coId) });

  if (isLoading) return <p className="text-muted-foreground">Loading change order…</p>;
  if (isError || !changeOrder)
    return <p className="text-destructive">Failed to load change order: {(error as Error)?.message}</p>;

  return (
    <ChangeOrderWorkspace
      changeOrder={changeOrder}
      backHref={`/projects/${id}/change-orders`}
      backLabel="Back to change orders"
    />
  );
}
