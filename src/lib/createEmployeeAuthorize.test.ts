import { describe, it, expect } from "vitest";
import { amrMethodsOf, authorizeCreateEmployee, jwtPayloadOf, type CallerFacts } from "../../supabase/functions/create-employee/authorize";

// Security fix 2026-09-28: create-employee used to reject only employees —
// anyone else signed in (a Client Hub client, a stranger's self-signup)
// could create a confirmed login for any email, including a client's.

const owner: CallerFacts = { userId: "owner-1", email: "rosa@cleangarden.com", amrMethods: ["password"], isEmployee: false, isClientOfAnotherBusiness: false };
const newCrew = { email: "jane@crew.com", belongsToAClient: false };

const fakeJwt = (payload: object) => `Bearer x.${btoa(JSON.stringify(payload)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.sig`;

describe("create-employee authorization", () => {
  it("the business owner (password session) can create an employee login", () => {
    expect(authorizeCreateEmployee(owner, newCrew)).toEqual({ ok: true });
    // A new owner who confirmed their email by link isn't a Client Hub session.
    expect(authorizeCreateEmployee({ ...owner, amrMethods: ["email/signup"] }, newCrew)).toEqual({ ok: true });
  });

  it("rejects a Client Hub client — their session is a magic link", () => {
    const client: CallerFacts = { userId: "client-1", email: "greg@home.com", amrMethods: ["otp"], isEmployee: false, isClientOfAnotherBusiness: true };
    expect(authorizeCreateEmployee(client, newCrew)).toMatchObject({ ok: false, status: 403 });
    // Even on an older auth version that calls it "magiclink", or with no client row found:
    expect(authorizeCreateEmployee({ ...client, amrMethods: ["magiclink"], isClientOfAnotherBusiness: false }, newCrew)).toMatchObject({ ok: false, status: 403 });
    // A first-time Hub client (account created by their first magic link):
    expect(authorizeCreateEmployee({ ...client, amrMethods: ["email/signup"] }, newCrew)).toMatchObject({ ok: false, status: 403 });
    // And a password login whose email is another business's client:
    expect(authorizeCreateEmployee({ ...client, amrMethods: ["password"] }, newCrew)).toMatchObject({ ok: false, status: 403 });
  });

  it("rejects a non-owner: employees and anonymous callers", () => {
    expect(authorizeCreateEmployee({ ...owner, isEmployee: true }, newCrew)).toMatchObject({ ok: false, status: 403 });
    expect(authorizeCreateEmployee({ ...owner, userId: null, email: null, amrMethods: [] }, newCrew)).toMatchObject({ ok: false, status: 401 });
  });

  it("refuses an employee login for an email that belongs to a client", () => {
    expect(authorizeCreateEmployee(owner, { email: "greg@home.com", belongsToAClient: true })).toMatchObject({ ok: false, status: 409, error: "email_is_client" });
  });

  it("reads the sign-in method from the session token (object or string amr)", () => {
    expect(amrMethodsOf(jwtPayloadOf(fakeJwt({ amr: [{ method: "password", timestamp: 1 }] })))).toEqual(["password"]);
    expect(amrMethodsOf(jwtPayloadOf(fakeJwt({ amr: [{ method: "OTP", timestamp: 1 }] })))).toEqual(["otp"]);
    expect(amrMethodsOf(jwtPayloadOf(fakeJwt({ amr: ["magiclink"] })))).toEqual(["magiclink"]);
    expect(amrMethodsOf(jwtPayloadOf("Bearer not-a-jwt"))).toEqual([]);
    expect(amrMethodsOf(jwtPayloadOf(null))).toEqual([]);
  });
});
