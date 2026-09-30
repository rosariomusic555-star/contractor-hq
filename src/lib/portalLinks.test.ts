import { describe, expect, it } from "vitest";
import { normalizeEmail, parsePortalLink, portalCallbackUrl } from "./portalLinks";

describe("portal sign-in links", () => {
  it("lands every link on the confirm page of the configured / current origin", () => {
    expect(portalCallbackUrl("https://hub.example.com/")).toBe(
      import.meta.env.VITE_PUBLIC_SITE_URL ? `${import.meta.env.VITE_PUBLIC_SITE_URL.replace(/\/+$/, "")}/portal/auth/confirm` : "https://hub.example.com/portal/auth/confirm",
    );
  });

  it("reads a token-hash link (the email template's)", () => {
    expect(parsePortalLink("?token_hash=abc&type=email&email=Pat%40x.com", "")).toEqual({ kind: "token_hash", tokenHash: "abc", type: "email", email: "Pat@x.com" });
    expect(parsePortalLink("?token_hash=abc", "")).toMatchObject({ type: "email", email: null });
    expect(parsePortalLink("?token_hash=abc&type=recovery", "")).toMatchObject({ type: "email" });
  });

  it("recognises expired / used links, including Supabase's error hash", () => {
    expect(parsePortalLink("", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired")).toEqual({
      kind: "error",
      code: "otp_expired",
      description: "Email link is invalid or has expired",
      email: null,
    });
    expect(parsePortalLink("?email=pat%40x.com&error_code=otp_expired", "")).toMatchObject({ kind: "error", email: "pat@x.com" });
  });

  it("recognises older implicit and PKCE links, and nothing at all", () => {
    expect(parsePortalLink("", "#access_token=t&refresh_token=r")).toEqual({ kind: "implicit" });
    expect(parsePortalLink("?code=xyz", "")).toEqual({ kind: "code", code: "xyz", email: null });
    expect(parsePortalLink("", "")).toEqual({ kind: "none", email: null });
  });

  it("normalizes emails the way they're stored", () => {
    expect(normalizeEmail("  Pat.Smith@Example.COM ")).toBe("pat.smith@example.com");
  });
});
