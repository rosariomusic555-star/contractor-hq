import { useMyName } from "./use-my-name";

/** Local-time boundaries — before noon is morning, before 5pm is afternoon,
 * else evening. Uses the browser's local clock (not server time) so it
 * matches whatever time the person looking at the screen actually sees.
 * Shared by the Dashboard header/banner and the crew home banner so they
 * never disagree. */
export function greetingLabel(date: Date = new Date()): string {
  const hour = date.getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/**
 * Time-of-day greeting + the signed-in person's first name (Settings › My
 * profile; a crew login's name from the owner). "" when no name is set —
 * callers then drop the ", {name}" suffix ("Good afternoon"). Never the
 * business name or the email address.
 */
export function useGreeting(): { greeting: string; firstName: string; hasName: boolean; isLoading: boolean } {
  const { firstName, hasName, isLoading } = useMyName();
  return { greeting: greetingLabel(), firstName, hasName, isLoading };
}
