const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** The starting email — asks for pricing/availability, the contractor edits it. */
export function defaultOrderEmail(p: { supplier: string; jobName: string; company: string | null; dateNeeded: string; address: string }) {
  const needed = p.dateNeeded ? `, needed by ${fmtDay(p.dateNeeded)}` : "";
  const deliver = p.address.trim() ? ` for delivery to ${p.address.trim().replace(/\s*\n\s*/g, ", ")}` : "";
  return {
    subject: `Material order — ${p.jobName}${p.company ? ` — ${p.company}` : ""}`,
    message: [
      `Hi ${p.supplier.trim() || "there"},`,
      "",
      `Attached is the material list for ${p.jobName}${deliver}${needed}.`,
      "Could you send over pricing and availability?",
      "",
      "Thanks,",
      p.company ?? "",
    ]
      .join("\n")
      .trimEnd(),
  };
}
