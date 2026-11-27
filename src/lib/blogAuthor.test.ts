import { describe, it, expect } from "vitest";
import { resolveBlogAuthor, authorDisplayName } from "./blogAuthor";
import type { PublicPractitioner } from "@/lib/practitioners/types";

const doc = (id: string, extra: Partial<PublicPractitioner> = {}) =>
  ({ id, display_name: `Dr. ${id}`, slug: `dr-${id}`, specialization: "Cardiology", photo_url: null, directory_listed: true, ...extra }) as PublicPractitioner;

describe("resolveBlogAuthor", () => {
  const team = [doc("a"), doc("b")];
  it("is null when the post has no practitioner", () => {
    expect(resolveBlogAuthor({ practitioner_id: null }, team)).toBeNull();
  });
  it("is null when the team is unknown or has fewer than 2 doctors", () => {
    expect(resolveBlogAuthor({ practitioner_id: "a" }, null)).toBeNull();
    expect(resolveBlogAuthor({ practitioner_id: "a" }, [doc("a")])).toBeNull();
  });
  it("is null when the author is not among the active doctors", () => {
    expect(resolveBlogAuthor({ practitioner_id: "zzz" }, team)).toBeNull();
  });
  it("returns the author and the team size", () => {
    const r = resolveBlogAuthor({ practitioner_id: "b" }, team);
    expect(r?.practitioner.id).toBe("b");
    expect(r?.clinicTeamSize).toBe(2);
  });
});

describe("authorDisplayName", () => {
  it("adds Dr. only when missing", () => {
    expect(authorDisplayName("Asha Rao")).toBe("Dr. Asha Rao");
    expect(authorDisplayName("Dr. Asha Rao")).toBe("Dr. Asha Rao");
    expect(authorDisplayName("Drake Miller")).toBe("Dr. Drake Miller");
  });
});
