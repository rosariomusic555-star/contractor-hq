/** "just now", "3 hours ago", "2 days ago", … from an ISO timestamp. */
export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let value = seconds;
  for (const [size, label] of units) {
    if (value < size) {
      const rounded = Math.floor(value);
      if (label === "second") return "just now";
      return `${rounded} ${label}${rounded === 1 ? "" : "s"} ago`;
    }
    value /= size;
  }
  return "just now";
}
