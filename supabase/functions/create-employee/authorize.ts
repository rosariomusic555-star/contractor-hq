// Who may create an employee login, and for which email. Pure (no Deno or
// network APIs) so it's unit-tested from the app's test suite
// (src/lib/createEmployeeAuthorize.test.ts); index.ts gathers the facts
// and asks this.
//
// Only the business owner, for their own business:
//   - signed in (anonymous → 401)
//   - not an employee login
//   - not a Client Hub session: owners sign in with a password; clients
//     only ever get in through the emailed magic link / one-time code
//   - not a client of another business (same email as someone's client)
// And never for an email that belongs to a client anywhere in the system —
// that login would otherwise look like the client to the Client Hub.
// The employee row itself is always inserted as the caller (owner_user_id =
// auth.uid()), so it can only ever join the caller's own business.

export interface CallerFacts {
  userId: string | null;
  email: string | null;
  /** The session's sign-in methods (JWT `amr`), e.g. ["password"] or ["otp"]. */
  amrMethods: string[];
  isEmployee: boolean;
  /** The caller's email is saved as a client of a different business. */
  isClientOfAnotherBusiness: boolean;
}

export interface TargetFacts {
  email: string;
  /** Some business (any, including the caller's) has a client with this email. */
  belongsToAClient: boolean;
}

export type Decision = { ok: true } | { ok: false; status: number; error: string; message: string };

const MAGIC_LINK_METHODS = new Set(["otp", "magiclink"]);

/** Sign-in methods from a decoded JWT payload's `amr` claim — objects
 * ({ method, timestamp }) or plain strings, depending on the auth version. */
export function amrMethodsOf(payload: unknown): string[] {
  const amr = (payload as { amr?: unknown } | null)?.amr;
  if (!Array.isArray(amr)) return [];
  return amr
    .map((e) => (typeof e === "string" ? e : typeof e === "object" && e ? String((e as { method?: unknown }).method ?? "") : ""))
    .filter(Boolean)
    .map((m) => m.toLowerCase());
}

/** The payload of a "Bearer <jwt>" header, or null. Signature is NOT checked
 * here — the platform (verify_jwt) and auth.getUser() already did. */
export function jwtPayloadOf(authHeader: string | null): unknown {
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

export function authorizeCreateEmployee(caller: CallerFacts, target: TargetFacts | null): Decision {
  if (!caller.userId) return { ok: false, status: 401, error: "unauthorized", message: "Sign in to create employee logins." };
  if (caller.isEmployee) return { ok: false, status: 403, error: "forbidden", message: "Employee accounts can't create other employees." };
  if (caller.amrMethods.some((m) => MAGIC_LINK_METHODS.has(m)))
    return { ok: false, status: 403, error: "forbidden", message: "Only the business owner can create employee logins." };
  if (caller.isClientOfAnotherBusiness)
    return { ok: false, status: 403, error: "forbidden", message: "Only the business owner can create employee logins." };
  if (target?.belongsToAClient)
    return {
      ok: false,
      status: 409,
      error: "email_is_client",
      message: "That email belongs to a client. Use a different email for the employee's login.",
    };
  return { ok: true };
}
