import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { getBusinessProfile } from "@/lib/api";

/** Local-time boundaries — before noon is morning, before 6pm is afternoon,
 * else evening. Uses the browser's local clock (not server time) so it
 * matches whatever time the person looking at the screen actually sees.
 * Shared by the Dashboard header/banner and the crew home banner so they
 * never disagree. */
export function greetingLabel(date: Date = new Date()): string {
  const hour = date.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** First word of a name; "" if blank. */
function firstWord(name: unknown): string {
  return typeof name === "string" ? (name.trim().split(/\s+/)[0] ?? "") : "";
}

/**
 * Time-of-day greeting + the name to greet the owner by: their first name
 * from the account profile (user_metadata first_name / full_name), else the
 * business name from Settings › Business profile, else "" — callers then
 * drop the ", {name}" suffix ("Good afternoon"). Never derived from the
 * email address.
 */
export function useGreeting(): { greeting: string; firstName: string } {
  const { session } = useAuth();
  const meta = session?.user.user_metadata ?? {};
  const personal = firstWord(meta.first_name) || firstWord(meta.full_name);
  const { data: profile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile, enabled: !personal });
  return {
    greeting: greetingLabel(),
    firstName: personal || profile?.company_name?.trim() || "",
  };
}
