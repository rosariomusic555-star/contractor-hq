import { describe, expect, it } from "vitest";
import { resolveMyName } from "./use-my-name";

describe("resolveMyName", () => {
  it("uses the profile name, initials from first + last", () => {
    const n = resolveMyName({ profile: { first_name: "Jose", last_name: "Garcia" }, email: "jg@x.com" });
    expect(n).toMatchObject({ firstName: "Jose", fullName: "Jose Garcia", display: "Jose Garcia", initials: "JG", hasName: true });
  });

  it("falls back to the names saved at sign-up, then a single full_name", () => {
    expect(resolveMyName({ meta: { first_name: "Ana", last_name: "Ruiz" } }).fullName).toBe("Ana Ruiz");
    expect(resolveMyName({ meta: { full_name: "Mary Ann Lee" } })).toMatchObject({ firstName: "Mary", lastName: "Ann Lee" });
  });

  it("a crew login uses the name the owner set", () => {
    const n = resolveMyName({ employeeName: "  Jane  Doe ", profile: { first_name: "Ignored" }, email: "jane@j.com" });
    expect(n).toMatchObject({ firstName: "Jane", fullName: "Jane Doe", initials: "JD" });
  });

  it("no name: email for display and initials, never a greeting name", () => {
    const n = resolveMyName({ profile: { first_name: "  ", last_name: null }, email: "owner@acme.com" });
    expect(n).toMatchObject({ firstName: "", fullName: "", display: "owner@acme.com", initials: "OW", hasName: false });
  });

  it("first name only: two letters of it", () => {
    expect(resolveMyName({ profile: { first_name: "Jose" } }).initials).toBe("JO");
  });
});
