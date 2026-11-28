import { describe, it, expect } from "vitest";
import {
  resolveBlogAuthor, authorDisplayName, authorHref, authorFilterOptions, clinicAuthorKey, filterPostsByAuthor, isTeamList,
  pickRelatedPosts, postAuthorKey, shortBio,
} from "./blogAuthor";
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

describe("team helpers", () => {
  const team = [doc("a"), doc("b")];
  it("isTeamList needs two doctors", () => {
    expect(isTeamList(null)).toBe(false);
    expect(isTeamList([doc("a")])).toBe(false);
    expect(isTeamList(team)).toBe(true);
  });
  it("the clinic key avoids a doctor whose slug is 'clinic'", () => {
    expect(clinicAuthorKey(team)).toBe("clinic");
    expect(clinicAuthorKey([doc("a", { slug: "clinic" }), doc("b")])).toBe("_clinic");
  });
  it("postAuthorKey is the doctor's slug, or the clinic key when there is no (active) author", () => {
    expect(postAuthorKey({ practitioner_id: "b" }, team)).toBe("dr-b");
    expect(postAuthorKey({ practitioner_id: null }, team)).toBe("clinic");
    expect(postAuthorKey({ practitioner_id: "gone" }, team)).toBe("clinic");
  });
  it("an unlisted doctor is still credited by name (no profile link), so they keep their own key", () => {
    const t = [doc("a"), doc("b", { directory_listed: false })];
    expect(postAuthorKey({ practitioner_id: "b" }, t)).toBe("dr-b");
  });
});

describe("authorFilterOptions / filterPostsByAuthor", () => {
  const team = [doc("a"), doc("b"), doc("c")];
  const posts = [
    { id: "1", practitioner_id: "b" }, { id: "2", practitioner_id: "a" }, { id: "3", practitioner_id: null },
    { id: "4", practitioner_id: "b" }, { id: "5", practitioner_id: "removed" },
  ];
  it("is empty outside a team clinic or when everything has one author", () => {
    expect(authorFilterOptions(posts, null)).toEqual([]);
    expect(authorFilterOptions([{ id: "1", practitioner_id: "a" }], team)).toEqual([]);
    expect(authorFilterOptions([], team)).toEqual([]);
  });
  it("lists doctors with posts in team order, then the clinic, with counts; deactivated authors fall into Clinic", () => {
    expect(authorFilterOptions(posts, team)).toEqual([
      { key: "dr-a", label: "Dr. a", count: 1 },
      { key: "dr-b", label: "Dr. b", count: 2 },
      { key: "clinic", label: "Clinic", count: 2 },
    ]);
  });
  it("filters by key and ignores an unknown key", () => {
    expect(filterPostsByAuthor(posts, team, "dr-b").map((p) => p.id)).toEqual(["1", "4"]);
    expect(filterPostsByAuthor(posts, team, "clinic").map((p) => p.id)).toEqual(["3", "5"]);
    expect(filterPostsByAuthor(posts, team, "nobody")).toHaveLength(5);
    expect(filterPostsByAuthor(posts, team, null)).toHaveLength(5);
    expect(filterPostsByAuthor(posts, null, "dr-b")).toHaveLength(5);
  });
  it("a slug with special characters round-trips as a key", () => {
    const odd = [doc("a", { slug: "dr-o'neil & co" }), doc("b")];
    const ps = [{ id: "1", practitioner_id: "a" }, { id: "2", practitioner_id: "b" }];
    expect(filterPostsByAuthor(ps, odd, "dr-o'neil & co").map((p) => p.id)).toEqual(["1"]);
  });
});

describe("pickRelatedPosts", () => {
  const ps = [
    { id: "1", practitioner_id: "b" }, { id: "2", practitioner_id: "a" }, { id: "3", practitioner_id: "a" },
    { id: "4", practitioner_id: null }, { id: "5", practitioner_id: "a" }, { id: "6", practitioner_id: "a" },
  ];
  it("prefers the same author, keeping date order, and caps at three", () => {
    const r = pickRelatedPosts(ps, "a");
    expect(r.posts.map((p) => p.id)).toEqual(["2", "3", "5"]);
    expect(r.allSameAuthor).toBe(true);
  });
  it("fills up with other posts when the author has fewer", () => {
    const r = pickRelatedPosts(ps, "b");
    expect(r.posts.map((p) => p.id)).toEqual(["1", "2", "3"]);
    expect(r.allSameAuthor).toBe(false);
  });
  it("is plain recency without an author", () => {
    const r = pickRelatedPosts(ps, null);
    expect(r.posts.map((p) => p.id)).toEqual(["1", "2", "3"]);
    expect(r.allSameAuthor).toBe(false);
  });
  it("nobody has written anything else", () => {
    expect(pickRelatedPosts([], "a")).toEqual({ posts: [], allSameAuthor: false });
  });
});

describe("shortBio", () => {
  it("collapses whitespace and cuts at a word with an ellipsis", () => {
    expect(shortBio("  Asha   treats\nfamilies.  ")).toBe("Asha treats families.");
    const long = "word ".repeat(100);
    const out = shortBio(long, 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });
  it("is empty for no bio", () => {
    expect(shortBio(null)).toBe("");
  });
});

describe("authorHref", () => {
  it("links listed doctors only, and encodes unusual slugs", () => {
    expect(authorHref("c", doc("a"))).toBe("/dr/c/doctor/dr-a");
    expect(authorHref("c", doc("a", { directory_listed: false }))).toBeNull();
    expect(authorHref("c l", doc("a", { slug: "o'neil &x" }))).toBe("/dr/c%20l/doctor/o'neil%20%26x");
  });
});

describe("authorDisplayName", () => {
  it("adds Dr. only when missing", () => {
    expect(authorDisplayName("Asha Rao")).toBe("Dr. Asha Rao");
    expect(authorDisplayName("Dr. Asha Rao")).toBe("Dr. Asha Rao");
    expect(authorDisplayName("Drake Miller")).toBe("Dr. Drake Miller");
  });
});
