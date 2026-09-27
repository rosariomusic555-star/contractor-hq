/* =============================================================================
 * Client heads-up (0121) — the ONE place a client message leaves the app.
 *
 * Today real SMS/email sending is on hold, so:
 *   text  → opens the phone's Messages app (sms: link, message prefilled)
 *   email → opens the mail app (mailto: link, to/subject/body prefilled)
 *   copy  → copies the message (desktop, WhatsApp, anything else)
 * The app can't see whether the contractor actually hit Send, so these
 * return "opened" / "copied" and the UI asks "Mark as sent?".
 *
 * When a real SMS/email integration is added, only sendClientMessage()
 * changes (and returns "sent" — the UI then skips the question).
 * ========================================================================== */

export type MessageChannel = "text" | "email" | "copy";
export type SendResult = { status: "opened" | "copied" | "sent" } | { status: "failed"; error: string };

/** Digits (and a leading +) only — what sms: links expect. */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export function isApplePlatform(ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  return /iPhone|iPad|iPod|Macintosh/i.test(ua);
}

/**
 * sms: link with the body prefilled. iOS/macOS Messages reads the body after
 * `&` (`sms:+15551234567&body=…`); Android and others use a normal query
 * string (`sms:+15551234567?body=…`).
 */
export function smsHref(phone: string, body: string, ua?: string): string {
  const sep = isApplePlatform(ua) ? "&" : "?";
  return `sms:${normalizePhone(phone)}${sep}body=${encodeURIComponent(body)}`;
}

/** mailto: with subject + body (line breaks as CRLF, per RFC 6068). */
export function mailtoHref(email: string, subject: string, body: string): string {
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, "\r\n"));
  return `mailto:${encodeURIComponent(email.trim()).replace(/%40/g, "@")}?subject=${enc(subject)}&body=${enc(body)}`;
}

function openHref(href: string) {
  // A plain navigation hands sms:/mailto: to the OS without leaving the app.
  window.location.href = href;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure contexts — fall back to a hidden textarea.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Send (today: open / copy) one message to one client. */
export async function sendClientMessage(
  channel: MessageChannel,
  to: string | null,
  body: string,
  subject = "",
): Promise<SendResult> {
  if (channel === "copy") {
    return (await copyText(body)) ? { status: "copied" } : { status: "failed", error: "Couldn't copy — select the text and copy it by hand." };
  }
  if (!to?.trim()) return { status: "failed", error: channel === "text" ? "No phone number on file." : "No email on file." };
  openHref(channel === "text" ? smsHref(to, body) : mailtoHref(to, subject, body));
  return { status: "opened" };
}
