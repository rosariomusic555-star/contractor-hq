import type { useQueryClient } from "@tanstack/react-query";

export function invalidateReviews(qc: ReturnType<typeof useQueryClient>) {
  for (const key of [["review-requests"], ["review-request"], ["project-events"], ["communications"], ["activities"]]) qc.invalidateQueries({ queryKey: key });
}
