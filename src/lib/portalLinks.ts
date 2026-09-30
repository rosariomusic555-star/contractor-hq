/**
 * Client Hub sign-in links — one place for where they land and how the
 * landing URL is read.
 *
 * Links are built by Supabase's email templates (Magic Link + Confirm
 * signup) as `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email&email={{ .Email }}`,
 * so they carry a one-time token hash that ANY browser can verify with
 * verifyOtp() — no PKCE code verifier, no session tokens in the URL — and
 * the landing page only verifies it on a click, so an email scanner that
 * prefetches the link can't use it up. Older links (Supabase's default
 * {{ .ConfirmationURL }} template) still arrive as `#access_token=…` or, when
 * expired / already used, `#error_code=otp_expired`; both are handled too.
 */

export const PORTAL_CONFIRM_PATH = "/portal/auth/confirm";

/** The Hub's public origin — VITE_PUBLIC_SITE_URL (set per environment, e.g.
 * the production domain on Vercel) or, locally, wherever the app is open. */
export function portalSiteUrl(origin: string = window.location.origin): string {
  const configured = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim();
  return (configured || origin).replace(/\/+$/, "");
}

/** Where every Hub sign-in link (invite or "send me a new link") lands. */
export function portalCallbackUrl(origin?: string): string {
  return `${portalSiteUrl(origin)}${PORTAL_CONFIRM_PATH}`;
}

/** Trim + lowercase — the one email form stored and matched everywhere. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const OTP_TYPES = ["email", "magiclink", "signup", "invite"] as const;
export type PortalOtpType = (typeof OTP_TYPES)[number];

export type PortalLinkParams =
  | { kind: "token_hash"; tokenHash: string; type: PortalOtpType; email: string | null }
  | { kind: "code"; code: string; email: string | null }
  | { kind: "implicit" }
  | { kind: "error"; code: string | null; description: string | null; email: string | null }
  | { kind: "none"; email: string | null };

/** What a landing URL carries. `search` / `hash` include their leading ?/#. */
export function parsePortalLink(search: string, hash: string): PortalLinkParams {
  const q = new URLSearchParams(search.replace(/^\?/, ""));
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  const email = q.get("email")?.trim() || null;
  const errorCode = h.get("error_code") ?? q.get("error_code");
  const errorDesc = h.get("error_description") ?? q.get("error_description");
  if (errorCode || errorDesc || h.get("error") || q.get("error")) {
    return { kind: "error", code: errorCode, description: errorDesc, email };
  }
  const tokenHash = q.get("token_hash");
  if (tokenHash) {
    const t = (q.get("type") ?? "email") as PortalOtpType;
    return { kind: "token_hash", tokenHash, type: OTP_TYPES.includes(t) ? t : "email", email };
  }
  const code = q.get("code");
  if (code) return { kind: "code", code, email };
  if (h.get("access_token")) return { kind: "implicit" };
  return { kind: "none", email };
}

/**
 * The landing URL as it was when the page first loaded — captured before
 * supabase-js reads (and clears) the hash, so an error hash from an expired
 * link can still be explained to the client afterwards.
 */
export const initialPortalLink: PortalLinkParams =
  typeof window === "undefined" ? { kind: "none", email: null } : parsePortalLink(window.location.search, window.location.hash);
