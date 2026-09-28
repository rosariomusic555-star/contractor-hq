import { useQuery } from "@tanstack/react-query";
import { getBusinessProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Who "recorded" a manual approval, as shown on quotes / change orders:
 * the owner's name, else the company name — never the login email. */
export function recorderName(fullName: string | null | undefined, companyName: string | null | undefined): string {
  return fullName?.trim() || companyName?.trim() || "Contractor";
}

export function useRecorderName(): string {
  const { session } = useAuth();
  const { data: profile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });
  return recorderName(session?.user?.user_metadata?.full_name as string | undefined, profile?.company_name);
}
