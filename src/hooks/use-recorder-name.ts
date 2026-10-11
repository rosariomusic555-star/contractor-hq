import { useQuery } from "@tanstack/react-query";
import { getBusinessProfile } from "@/lib/api";
import { useMyName } from "./use-my-name";

/** Who "recorded" a manual approval, as shown on quotes / change orders:
 * the owner's name, else the company name — never the login email. */
export function recorderName(fullName: string | null | undefined, companyName: string | null | undefined): string {
  return fullName?.trim() || companyName?.trim() || "Contractor";
}

export function useRecorderName(): string {
  const { fullName } = useMyName();
  const { data: profile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });
  return recorderName(fullName, profile?.company_name);
}
