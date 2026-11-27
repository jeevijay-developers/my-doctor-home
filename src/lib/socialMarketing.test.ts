import { describe, expect, it } from "vitest";
import { emptyScope, missingForActivation, describeMissing, type SocialMarketing } from "./socialMarketing";

const complete = (): SocialMarketing => ({
  ...emptyScope(),
  platforms: ["instagram"],
  posts_per_month: 8,
  post_types: ["reel"],
  publishing_by: "company",
  reporting_frequency: "monthly",
  approval_process: "each_post",
  monthly_fee: 5000,
  access_confirmed: true,
  agreed: true,
  agreed_on: "2026-11-27",
  agreement_ref: "WhatsApp 27 Nov",
});

describe("missingForActivation", () => {
  it("lists every required field on an empty scope", () => {
    expect(missingForActivation(emptyScope()).sort()).toEqual(
      ["access_confirmed", "agreement", "approval_process", "monthly_fee", "platforms", "post_types", "posts_per_month", "publishing_by", "reporting_frequency"].sort(),
    );
  });

  it("is empty for a complete scope", () => {
    expect(missingForActivation(complete())).toEqual([]);
  });

  it("a fee of 0 is a recorded fee", () => {
    expect(missingForActivation({ ...complete(), monthly_fee: 0 })).toEqual([]);
  });

  it.each([
    ["agreed false", { agreed: false }],
    ["no date", { agreed_on: null }],
    ["blank reference", { agreement_ref: "   " }],
  ])("agreement is missing when %s", (_n, patch) => {
    expect(missingForActivation({ ...complete(), ...patch })).toEqual(["agreement"]);
  });

  it("paid ads need an ad spend figure, but 0 counts", () => {
    expect(missingForActivation({ ...complete(), paid_ads: true })).toEqual(["ad_spend_monthly"]);
    expect(missingForActivation({ ...complete(), paid_ads: true, ad_spend_monthly: 0 })).toEqual([]);
  });

  it("ad spend is not required when there are no paid ads", () => {
    expect(missingForActivation({ ...complete(), paid_ads: false, ad_spend_monthly: null })).toEqual([]);
  });
});

describe("describeMissing", () => {
  it("uses readable labels", () => {
    expect(describeMissing(["monthly_fee", "agreement"])).toEqual(["Monthly service fee", "Client agreement (date and reference)"]);
  });
});
