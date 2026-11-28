import { describe, expect, it } from "vitest";
import { bioParagraphs, doctorPageNoindex, otherDoctors, servicesForDoctor } from "./practitionerPage";
import type { PublicPractitioner } from "../practitioners/types";

const svc = (id: string, type = "clinic") => ({ id, type });

describe("servicesForDoctor", () => {
  const services = [svc("s1"), svc("s2"), svc("s3", "online")];
  it("no mapping rows at all: every service is offered", () => {
    expect(servicesForDoctor(services, [], "pa", true).map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(servicesForDoctor(services, null, "pa", true)).toHaveLength(3);
  });
  it("a service with rows is offered only by the doctors named; one without rows by everyone", () => {
    const maps = [{ service_id: "s1", practitioner_id: "pb" }, { service_id: "s2", practitioner_id: "pa" }];
    expect(servicesForDoctor(services, maps, "pa", true).map((s) => s.id)).toEqual(["s2", "s3"]);
    expect(servicesForDoctor(services, maps, "pb", true).map((s) => s.id)).toEqual(["s1", "s3"]);
  });
  it("hides online-only services the plan cannot sell", () => {
    expect(servicesForDoctor(services, [], "pa", false).map((s) => s.id)).toEqual(["s1", "s2"]);
  });
  it("is empty when every service is mapped to other doctors", () => {
    const maps = [{ service_id: "s1", practitioner_id: "pb" }, { service_id: "s2", practitioner_id: "pb" }];
    expect(servicesForDoctor([svc("s1"), svc("s2")], maps, "pa", true)).toEqual([]);
  });
  it("tolerates missing lists", () => {
    expect(servicesForDoctor(undefined, undefined, "pa", true)).toEqual([]);
  });
});

describe("otherDoctors", () => {
  const d = (id: string, slug: string) => ({ id, slug }) as PublicPractitioner;
  it("excludes the current doctor and any doctor without a slug, keeping order", () => {
    expect(otherDoctors([d("a", "a"), d("b", "b"), d("c", ""), d("e", "e")], "b").map((x) => x.id)).toEqual(["a", "e"]);
    expect(otherDoctors(null, "a")).toEqual([]);
  });
});

describe("doctorPageNoindex", () => {
  const bio = "Dr. Asha has treated families in Kota for over a decade and runs the cardiac clinic.";
  it("indexable only when listed and the bio is real", () => {
    expect(doctorPageNoindex({ slug: "a", bio, directory_listed: true })).toBe(false);
    expect(doctorPageNoindex({ slug: "a", bio, directory_listed: false })).toBe(true);
    expect(doctorPageNoindex({ slug: "a", bio: "Short.", directory_listed: true })).toBe(true);
    expect(doctorPageNoindex({ slug: "a", bio: null, directory_listed: true })).toBe(true);
  });
});

describe("bioParagraphs", () => {
  it("splits on blank lines, trims, drops empties and normalises CRLF", () => {
    expect(bioParagraphs("One\r\n\r\n\r\n  Two line a\nline b \n\n")).toEqual(["One", "Two line a\nline b"]);
    expect(bioParagraphs("   ")).toEqual([]);
    expect(bioParagraphs(null)).toEqual([]);
  });
});
