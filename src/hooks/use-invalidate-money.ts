import { useQueryClient } from "@tanstack/react-query";

/** Everything a payment change (0111) can move: payments, invoice paid /
 * balance / status (trigger-synced), and every screen that reads them. */
export function useInvalidateMoney() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["payments", "payment-events", "invoice", "invoices", "client-invoices", "projects", "project-events"]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };
}
