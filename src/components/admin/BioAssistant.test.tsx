import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import BioAssistant, { type BioAssistantContext } from "./BioAssistant";

const h = vi.hoisted(() => ({ token: "tok" as string | null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: h.token ? { access_token: h.token } : null } }) } },
}));

const CTX: BioAssistantContext = {
  name: "Meera Shah", specialization: "Dermatologist", qualifications: "MBBS, MD", experience: 12,
  clinicName: "Shah Skin Clinic", locality: "Talwandi", city: "Kota", services: ["Acne treatment"],
};

const Harness = ({ initial = "", context = CTX, disabled = false, onValue }: { initial?: string; context?: BioAssistantContext; disabled?: boolean; onValue?: (v: string) => void }) => {
  const [v, setV] = useState(initial);
  return <BioAssistant idPrefix="t" value={v} onChange={(x) => { setV(x); onValue?.(x); }} context={context} disabled={disabled} />;
};
const box = () => screen.getByLabelText(/^bio/i) as HTMLTextAreaElement;
const AI_BIO = "Dr. Meera Shah is a Dermatologist in Kota with 12+ years of experience. Patients can book an appointment online.";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  h.token = "tok";
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ bio: AI_BIO }) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("BioAssistant: box and counter", () => {
  it("shows a live counter, plain-text box and the search advice", () => {
    render(<Harness />);
    fireEvent.change(box(), { target: { value: "hello" } });
    expect(screen.getByTestId("bio-counter")).toHaveTextContent("5/2000");
    expect(box()).toHaveAttribute("maxLength", "2000");
    expect(screen.getByText(/mention your specialty, city and qualifications so patients searching on google find you/i)).toBeInTheDocument();
  });

  it("disabled: textarea locked and no helper buttons", () => {
    render(<Harness disabled initial="x" />);
    expect(box()).toBeDisabled();
    expect(screen.queryByRole("button", { name: /fill from my details/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /write with ai/i })).toBeNull();
  });
});

describe("BioAssistant: Fill from my details", () => {
  it("fills an empty bio at once with no confirmation, and offers Undo", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /fill from my details/i }));
    expect(box().value).toContain("Dr. Meera Shah is a Dermatologist in Talwandi, Kota with 12+ years of experience (MBBS, MD).");
    expect(box().value).toContain("Acne treatment");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(box().value).toBe("");
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
  });

  it("asks before overwriting a written bio; Keep leaves it, Replace overwrites and Undo brings it back", () => {
    render(<Harness initial="My own words about my practice that I wrote." />);
    fireEvent.click(screen.getByRole("button", { name: /fill from my details/i }));
    const dlg = screen.getByRole("alertdialog");
    fireEvent.click(within(dlg).getByRole("button", { name: /keep my bio/i }));
    expect(box().value).toBe("My own words about my practice that I wrote.");
    expect(screen.queryByRole("alertdialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /fill from my details/i }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: /replace my bio/i }));
    expect(box().value).toMatch(/^Dr\. Meera Shah is a Dermatologist/);
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(box().value).toBe("My own words about my practice that I wrote.");
  });

  it("conditions are opt-in: none ticked by default and none inserted until ticked", () => {
    render(<Harness />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBeGreaterThanOrEqual(4);
    expect(boxes.every((b) => !(b as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /fill from my details/i }));
    expect(box().value).not.toMatch(/sees patients for/);

    fireEvent.click(screen.getByLabelText("acne"));
    fireEvent.click(screen.getByLabelText("eczema"));
    fireEvent.click(screen.getByRole("button", { name: /fill from my details/i }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: /replace my bio/i }));
    expect(box().value).toContain("sees patients for acne and eczema.");
  });

  it("no condition list for 'Other' or an unknown specialty", () => {
    render(<Harness context={{ ...CTX, specialization: "Other" }} />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("with no name or specialization it explains instead of writing an empty bio", () => {
    render(<Harness context={{}} />);
    fireEvent.click(screen.getByRole("button", { name: /fill from my details/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/add your name or specialization/i);
    expect(box().value).toBe("");
  });

  it("special characters in the details never reach the bio as markup", () => {
    render(<Harness context={{ ...CTX, name: "<img src=x onerror=1>Meera", clinicName: "A<script>x</script>B" }} />);
    fireEvent.click(screen.getByRole("button", { name: /fill from my details/i }));
    expect(box().value).not.toMatch(/<|>/);
  });
});

describe("BioAssistant: Write with AI", () => {
  it("posts the details with the user's token and puts the result in the box (not saved)", async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    fireEvent.change(screen.getByLabelText(/anything else that is true/i), { target: { value: "Speaks Hindi" } });
    fireEvent.click(screen.getByLabelText("acne"));
    fireEvent.click(screen.getByRole("button", { name: /write with ai/i }));
    await waitFor(() => expect(box().value).toBe(AI_BIO));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/functions\/v1\/ai-bio-writer$/);
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({
      name: "Meera Shah", specialization: "Dermatologist", qualifications: "MBBS, MD", experienceYears: 12,
      clinicName: "Shah Skin Clinic", locality: "Talwandi", city: "Kota", services: ["Acne treatment"],
      conditions: ["acne"], tone: "professional", optionalNotes: "Speaks Hindi",
    });
    expect(screen.getByRole("status")).toHaveTextContent(/ai wrote a draft/i);
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();
  });

  it("strips markup the AI returns", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ bio: "<b>**Bold** claim</b> text" }) });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /write with ai/i }));
    await waitFor(() => expect(box().value).toBe("Bold claim text"));
  });

  it("asks before overwriting and does not call the AI until confirmed", async () => {
    render(<Harness initial="Existing bio text that is long enough to keep." />);
    fireEvent.click(screen.getByRole("button", { name: /write with ai/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: /replace my bio/i }));
    await waitFor(() => expect(box().value).toBe(AI_BIO));
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(box().value).toBe("Existing bio text that is long enough to keep.");
  });

  it("shows a spinner state while writing and disables the box", async () => {
    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /write with ai/i }));
    await waitFor(() => expect(box()).toBeDisabled());
    expect(screen.getByRole("status")).toHaveTextContent(/writing your bio/i);
    resolve({ ok: true, status: 200, json: async () => ({ bio: AI_BIO }) });
    await waitFor(() => expect(box()).not.toBeDisabled());
  });

  it.each([
    [429, /used all your ai bios for this hour/i],
    [403, /not available for your account/i],
    [401, /sign in again/i],
    [502, /could not write your bio/i],
    [504, /took too long/i],
  ])("status %s shows a friendly message and leaves the bio alone", async (status, message) => {
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({ error: "raw upstream detail" }) });
    render(<Harness initial="" />);
    fireEvent.click(screen.getByRole("button", { name: /write with ai/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/raw upstream detail/);
    expect(box().value).toBe("");
  });

  it("network failure and an empty reply are reported", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /write with ai/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the ai/i);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ bio: "   " }) });
    fireEvent.click(screen.getByRole("button", { name: /write with ai/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/did not return a bio/i));
  });

  it("offline: says so without calling the function", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /write with ai/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/offline/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no session: asks to sign in, no call", async () => {
    h.token = null;
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /write with ai/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/sign in again/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("BioAssistant: search checklist", () => {
  it("lists each keyword with words (Done/Missing), not just colour", () => {
    render(<Harness />);
    const list = screen.getByRole("region", { name: /search checklist/i });
    expect(within(list).getAllByText(/^missing:/i).length).toBe(6);
    for (const t of [/mentions your specialty/i, /mentions your city or area/i, /mentions your qualifications/i, /years of experience/i, /invites patients to book/i, /at least 60 characters/i]) {
      expect(within(list).getByText(t)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: /fill from my details/i }));
    expect(within(list).queryAllByText(/^missing:/i)).toHaveLength(0);
    expect(within(list).getAllByText(/^done:/i).length).toBe(6);
  });

  it("the 60-character rule flips at 59/60", () => {
    render(<Harness context={{}} />);
    fireEvent.change(box(), { target: { value: "a".repeat(59) } });
    expect(screen.getByText(/add 1 characters to reach the 60/i)).toBeInTheDocument();
    fireEvent.change(box(), { target: { value: "a".repeat(60) } });
    expect(screen.getByText(/long enough to be listed/i)).toBeInTheDocument();
  });

  it("no longer shows an advertising caution box, and never blocks typing", () => {
    render(<Harness />);
    fireEvent.change(box(), { target: { value: "The best doctor with a 100% guaranteed cure." } });
    expect(screen.queryByTestId("bio-warnings")).not.toBeInTheDocument();
    expect(screen.queryByText(/friendly caution/i)).not.toBeInTheDocument();
    expect(box().value).toBe("The best doctor with a 100% guaranteed cure.");
  });
});
