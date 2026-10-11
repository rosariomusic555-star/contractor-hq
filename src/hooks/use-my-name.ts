import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { getUserProfile, type UserProfile } from "@/lib/api";

export interface MyName {
  firstName: string;
  lastName: string;
  /** "Jose Garcia"; "" when no name is set. */
  fullName: string;
  /** The name to show for this person: the full name, else the email. */
  display: string;
  /** Two letters for an avatar: from the name, else the email. */
  initials: string;
  email: string;
  hasName: boolean;
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

/** Pure: the person's name parts from what's known about them. A crew
 *  login's name is employees.name (set by the owner); an owner's is their
 *  profile row, else the names saved on the account at sign-up. */
export function resolveMyName(input: { employeeName?: string | null; profile?: Partial<UserProfile> | null; meta?: Record<string, unknown> | null; email?: string | null }): MyName {
  const email = input.email?.trim() ?? "";
  let first = "";
  let last = "";
  if (input.employeeName?.trim()) {
    const parts = words(input.employeeName);
    first = parts[0] ?? "";
    last = parts.slice(1).join(" ");
  } else {
    const meta = input.meta ?? {};
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    first = input.profile?.first_name?.trim() || str(meta.first_name);
    last = input.profile?.last_name?.trim() || str(meta.last_name);
    // Older accounts: a single full_name only.
    if (!first && !last && str(meta.full_name)) {
      const parts = words(str(meta.full_name));
      first = parts[0] ?? "";
      last = parts.slice(1).join(" ");
    }
  }
  const fullName = [first, last].filter(Boolean).join(" ");
  const initials = fullName
    ? ((first[0] ?? "") + (last ? last[0] : (first[1] ?? ""))).toUpperCase()
    : email.slice(0, 2).toUpperCase() || "?";
  return { firstName: first, lastName: last, fullName, display: fullName || email, initials, email, hasName: !!first };
}

/** The signed-in person's own profile row (owners), "missing" before 0170. */
export function useUserProfile() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  return useQuery({ queryKey: ["user-profile", uid], queryFn: getUserProfile, enabled: !!uid && role === "owner", staleTime: 5 * 60_000 });
}

/** The signed-in person's name — never the business name. */
export function useMyName(): MyName & { isLoading: boolean } {
  const { session, employee } = useAuth();
  const { data, isLoading } = useUserProfile();
  const profile = data && data !== "missing" ? data : null;
  return {
    ...resolveMyName({ employeeName: employee?.name, profile, meta: session?.user.user_metadata, email: session?.user.email }),
    isLoading: !employee && isLoading,
  };
}
