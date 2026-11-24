import "./__test__/intersectionObserverStub";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import GallerySection from "./GallerySection";
import { useDoctorData } from "@/contexts/DoctorContext";

vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: vi.fn() }));
vi.mock("./motion/useSplitReveal", () => ({ useSplitReveal: () => {} }));

const photo = (id: string, caption: string) => ({ id, photo_url: `https://x/${id}.jpg`, caption });
const mockPhotos = (gallery: unknown[]) => vi.mocked(useDoctorData).mockReturnValue({ gallery } as never);

describe("GallerySection", () => {
  it("shows a placeholder (not a vanished section) when switched on without photos, and survives photos arriving later (hook order)", () => {
    mockPhotos([]);
    const { rerender } = render(<GallerySection />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("A look inside");
    expect(screen.getByText("Photos of the clinic will appear here soon.")).toBeInTheDocument();
    mockPhotos([photo("a", "Waiting room")]);
    expect(() => rerender(<GallerySection />)).not.toThrow();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("A look inside");
  });

  it("opens a lightbox on tap and steps through photos with the buttons", () => {
    mockPhotos([photo("a", "Waiting room"), photo("b", "Consulting room")]);
    render(<GallerySection />);
    fireEvent.click(screen.getByRole("button", { name: /Open photo 1 of 2: Waiting room/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByText("1 / 2")).toBeInTheDocument(); // wraps around
  });

  it("autoplays nothing: no timers move the photos on their own", () => {
    vi.useFakeTimers();
    mockPhotos([photo("a", "Waiting room"), photo("b", "Consulting room")]);
    render(<GallerySection />);
    vi.advanceTimersByTime(30_000);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
