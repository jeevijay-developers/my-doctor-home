import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import HubArticleCard from "./HubArticleCard";

const base = {
  id: "i1", slug: "post-1", title: "Post 1", excerpt: null, category: null, featured_image_url: null,
  published_at: "2026-10-01T00:00:00Z", updated_at: null, reading_minutes: 3,
  doctor_slug: "dr-a", doctor_name: "Anita Sharma", doctor_specialization: null, doctor_city: null, doctor_photo_url: null,
};
const r = (a: object) => render(<MemoryRouter><HubArticleCard article={{ ...base, ...a }} /></MemoryRouter>);

describe("HubArticleCard author", () => {
  it("prefers practitioner_name and keeps the canonical link", () => {
    r({ practitioner_name: "Ravi Menon" });
    expect(screen.getByText("Dr. Ravi Menon")).toBeInTheDocument();
    expect(screen.queryByText(/Anita/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Post 1/ })).toHaveAttribute("href", "/dr/dr-a/blog/post-1");
  });
  it("falls back to the clinic doctor name", () => {
    r({ practitioner_name: null });
    expect(screen.getByText("Dr. Anita Sharma")).toBeInTheDocument();
  });
});
