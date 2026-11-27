import { describe, expect, it } from "vitest";
import { buildBlogPostHead, buildBlogPostJsonLd, buildBlogPostMeta } from "./blogSeo";
import * as F from "./goldenFixtures";

// Golden output captured from the single-doctor code path BEFORE the P3 multi-doctor SEO changes.
// It must stay byte-identical.
const doctor = F.blogDoctor;
const post = F.blogPost;
const input = { origin: F.ORIGIN, doctor, post };

const GOLDEN_META = "{\"title\":\"Gum care basics · Dr. Anita Sharma | Doctylia\",\"description\":\"How to look after your gums.\",\"canonical\":\"https://doctylia.com/dr/dr-anita-sharma/blog/gum-care-basics\",\"image\":\"https://cdn.example.com/gums.jpg\"}";
const GOLDEN_JSONLD = "{\"@context\":\"https://schema.org\",\"@graph\":[{\"@type\":\"BlogPosting\",\"@id\":\"https://doctylia.com/dr/dr-anita-sharma/blog/gum-care-basics#article\",\"headline\":\"Gum care basics\",\"description\":\"How to look after your gums.\",\"url\":\"https://doctylia.com/dr/dr-anita-sharma/blog/gum-care-basics\",\"mainEntityOfPage\":{\"@type\":\"WebPage\",\"@id\":\"https://doctylia.com/dr/dr-anita-sharma/blog/gum-care-basics\"},\"datePublished\":\"2026-03-01T10:00:00Z\",\"dateModified\":\"2026-03-02T10:00:00Z\",\"articleSection\":\"Dental Health\",\"image\":[\"https://cdn.example.com/gums.jpg\"],\"inLanguage\":\"en-IN\",\"isPartOf\":{\"@type\":\"Blog\",\"@id\":\"https://doctylia.com/dr/dr-anita-sharma/blog#blog\",\"url\":\"https://doctylia.com/dr/dr-anita-sharma/blog\"},\"author\":{\"@type\":\"Person\",\"name\":\"Anita Sharma\",\"honorificPrefix\":\"Dr.\",\"url\":\"https://doctylia.com/dr/dr-anita-sharma\",\"jobTitle\":\"Dentist\",\"image\":\"https://cdn.example.com/anita.jpg\",\"worksFor\":{\"@type\":\"MedicalBusiness\",\"name\":\"Sharma Dental Clinic\",\"address\":{\"@type\":\"PostalAddress\",\"addressLocality\":\"Kota\",\"addressCountry\":\"IN\"}}},\"publisher\":{\"@type\":\"Organization\",\"name\":\"Doctylia\",\"url\":\"https://doctylia.com/\"}},{\"@type\":\"BreadcrumbList\",\"itemListElement\":[{\"@type\":\"ListItem\",\"position\":1,\"name\":\"Dr. Anita Sharma\",\"item\":\"https://doctylia.com/dr/dr-anita-sharma\"},{\"@type\":\"ListItem\",\"position\":2,\"name\":\"Health Articles\",\"item\":\"https://doctylia.com/dr/dr-anita-sharma/blog\"},{\"@type\":\"ListItem\",\"position\":3,\"name\":\"Gum care basics\",\"item\":\"https://doctylia.com/dr/dr-anita-sharma/blog/gum-care-basics\"}]}]}";
const GOLDEN_JSONLD_AI = "{\"@context\":\"https://schema.org\",\"@graph\":[{\"@type\":\"BlogPosting\",\"@id\":\"https://doctylia.com/dr/dr-anita-sharma/blog/gum-care-basics#article\",\"headline\":\"Gum care basics\",\"description\":\"How to look after your gums.\",\"url\":\"https://doctylia.com/dr/dr-anita-sharma/blog/gum-care-basics\",\"mainEntityOfPage\":{\"@type\":\"WebPage\",\"@id\":\"https://doctylia.com/dr/dr-anita-sharma/blog/gum-care-basics\"},\"datePublished\":\"2026-03-01T10:00:00Z\",\"dateModified\":\"2026-03-02T10:00:00Z\",\"articleSection\":\"Dental Health\",\"image\":[\"https://cdn.example.com/gums.jpg\"],\"inLanguage\":\"en-IN\",\"isPartOf\":{\"@type\":\"Blog\",\"@id\":\"https://doctylia.com/dr/dr-anita-sharma/blog#blog\",\"url\":\"https://doctylia.com/dr/dr-anita-sharma/blog\"},\"author\":{\"@type\":\"Person\",\"name\":\"Anita Sharma\",\"honorificPrefix\":\"Dr.\",\"url\":\"https://doctylia.com/dr/dr-anita-sharma\",\"jobTitle\":\"Dentist\",\"image\":\"https://cdn.example.com/anita.jpg\",\"worksFor\":{\"@type\":\"MedicalBusiness\",\"name\":\"Sharma Dental Clinic\",\"address\":{\"@type\":\"PostalAddress\",\"addressLocality\":\"Kota\",\"addressCountry\":\"IN\"}}},\"reviewedBy\":{\"@type\":\"Person\",\"name\":\"Anita Sharma\",\"honorificPrefix\":\"Dr.\",\"url\":\"https://doctylia.com/dr/dr-anita-sharma\",\"jobTitle\":\"Dentist\"},\"publisher\":{\"@type\":\"Organization\",\"name\":\"Doctylia\",\"url\":\"https://doctylia.com/\"}},{\"@type\":\"BreadcrumbList\",\"itemListElement\":[{\"@type\":\"ListItem\",\"position\":1,\"name\":\"Dr. Anita Sharma\",\"item\":\"https://doctylia.com/dr/dr-anita-sharma\"},{\"@type\":\"ListItem\",\"position\":2,\"name\":\"Health Articles\",\"item\":\"https://doctylia.com/dr/dr-anita-sharma/blog\"},{\"@type\":\"ListItem\",\"position\":3,\"name\":\"Gum care basics\",\"item\":\"https://doctylia.com/dr/dr-anita-sharma/blog/gum-care-basics\"}]}]}";
const GOLDEN_BODY = "<main><nav aria-label=\"Breadcrumb\"><a href=\"/dr/dr-anita-sharma\">Dr. Anita Sharma</a> / <a href=\"/dr/dr-anita-sharma/blog\">Health Articles</a></nav><article><h1>Gum care basics</h1><p>By <a href=\"/dr/dr-anita-sharma\">Dr. Anita Sharma</a>, Dentist &middot; <time datetime=\"2026-03-01T10:00:00Z\">2026-03-01</time></p><p>How to look after your gums.</p><h2>Brush well</h2>\n<p>Brush <strong>twice</strong> a day.</p>\n<ul>\n<li>Floss daily</li>\n<li>Visit your dentist</li>\n</ul>\n</article></main>";

describe("blogSeo golden (single doctor)", () => {
  it("meta is byte-identical", () => {
    expect(JSON.stringify(buildBlogPostMeta(input))).toBe(GOLDEN_META);
  });
  it("JSON-LD without ai_assisted is byte-identical", () => {
    expect(JSON.stringify(buildBlogPostJsonLd(input))).toBe(GOLDEN_JSONLD);
  });
  it("JSON-LD with ai_assisted is byte-identical", () => {
    expect(JSON.stringify(buildBlogPostJsonLd({ ...input, post: { ...post, ai_assisted: true } }))).toBe(GOLDEN_JSONLD_AI);
  });
  it("body html is byte-identical", () => {
    expect(buildBlogPostHead(input).bodyHtml).toBe(GOLDEN_BODY);
  });
});
