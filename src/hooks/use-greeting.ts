import { useMemo } from "react";
import { useAuth } from "@/lib/auth";

/** Local-time boundaries — before noon is morning, before 6pm is afternoon,
 * else evening. Uses the browser's local clock (not server time) so it
 * matches whatever time the person looking at the screen actually sees.
 * Shared by the mobile and desktop Dashboard headers so the two surfaces
 * never disagree. */
function greetingLabel(date: Date = new Date()): string {
  const hour = date.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** First word of a full name (Supabase user_metadata.full_name, when a
 * sign-up path set one — this app's own email/password sign-up doesn't
 * collect it, but a future OAuth provider or a manual edit in the Supabase
 * dashboard can). Empty string if the name is blank/whitespace-only. */
function firstNameFromFullName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

/** Best-effort first name from the account email — same level of inference
 * already used for the avatar initials. Empty string (not the email
 * itself) if nothing letter-based is found, e.g. a numbers-only local
 * part. */
function firstNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const word = local.split(/[^a-zA-Z]+/).find(Boolean) ?? "";
  return word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : "";
}

/**
 * Time-of-day greeting + best-effort first name for the signed-in account.
 * `firstName` is "" when neither a full name nor a usable email local-part
 * is available — callers should drop the ", {name}" suffix entirely
 * rather than render a blank name or fall back to showing the email.
 */
export function useGreeting(): { greeting: string; firstName: string } {
  const { session } = useAuth();
  const email = session?.user.email ?? "";
  const fullName = (session?.user.user_metadata?.full_name as string | undefined) ?? "";

  return useMemo(() => {
    const fromFullName = firstNameFromFullName(fullName);
    return {
      greeting: greetingLabel(),
      firstName: fromFullName || firstNameFromEmail(email),
    };
  }, [fullName, email]);
}
