import { useQuery } from "@tanstack/react-query";

export type SignUrls = (paths: string[]) => Promise<Record<string, string>>;

export const hubMoney = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const hubDate = (iso: string | null | undefined, long = false) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
        month: long ? "long" : "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

/** Shared focus ring for the desktop Hub's plain links / buttons. */
export const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** One signed image URL (logo, cover) — through whichever session is
 * looking: the client's portal session or the contractor's preview. */
export function useSignedUrl(path: string | null | undefined, signUrls: SignUrls) {
  const { data } = useQuery({
    queryKey: ["hub-signed-url", path],
    queryFn: () => signUrls([path!]),
    enabled: !!path,
    staleTime: 30 * 60 * 1000,
  });
  return path ? (data?.[path] ?? null) : null;
}

/** The same payment guidance the invoice page has always shown — there's no
 * online payment yet, so this is where a Pay button will go later. */
export const HOW_TO_PAY =
  "Pay by check, bank transfer, Zelle or another method your contractor accepts — contact them for details. You'll get a receipt for every payment.";
