import "./__test__/intersectionObserverStub";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ContactQueryForm from "./ContactQueryForm";
import { useDoctorData } from "@/contexts/DoctorContext";

vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: vi.fn() }));
vi.mock("./motion/useSplitReveal", () => ({ useSplitReveal: () => {} }));
const fn = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: fn.invoke } } }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const fill = (name: string, phone: string, message: string) => {
  fireEvent.change(screen.getByLabelText(/^Your name/), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(/^Mobile number/), { target: { value: phone } });
  fireEvent.change(screen.getByLabelText(/^Your message/), { target: { value: message } });
};
const send = () => fireEvent.click(screen.getByRole("button", { name: /send message/i }));

describe("ContactQueryForm", () => {
  beforeEach(() => {
    fn.invoke.mockReset();
    fn.invoke.mockResolvedValue({ data: {}, error: null });
    toast.error.mockReset();
    vi.mocked(useDoctorData).mockReturnValue({ profile: { id: "doc-1" } } as never);
  });

  it("shows what is missing under each field and focuses the first one, without calling the server", () => {
    render(<ContactQueryForm />);
    send();
    expect(screen.getByText("Please enter your name.")).toBeInTheDocument();
    expect(screen.getByText("Please enter your phone number.")).toBeInTheDocument();
    expect(screen.getByText("Please write your message.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Your name/)).toHaveFocus();
    expect(screen.getByLabelText(/^Your name/)).toHaveAttribute("aria-invalid", "true");
    expect(fn.invoke).not.toHaveBeenCalled();
  });

  it("validates a field as soon as the patient leaves it, not only on submit", () => {
    render(<ContactQueryForm />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const phone = screen.getByLabelText(/^Mobile number/);
    fireEvent.change(phone, { target: { value: "123" } });
    fireEvent.blur(phone);
    expect(screen.getByRole("alert")).toHaveTextContent(/valid/i);
  });

  it("shows email on the form above the message, without an optional tag, and marks required fields with *", () => {
    render(<ContactQueryForm />);
    const email = screen.getByLabelText("Email");
    expect(screen.queryByText(/optional/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add an email/ })).not.toBeInTheDocument();
    const message = screen.getByLabelText(/Your message/);
    expect(email.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const label of [/Your name/, /Mobile number/, /Your message/]) {
      expect(screen.getByText(label).textContent).toContain("*");
    }
    expect(screen.getByText("Email").textContent).not.toContain("*");
  });

  it("rejects an email that is not an email, but still allows leaving it empty", async () => {
    render(<ContactQueryForm />);
    const email = screen.getByLabelText("Email");
    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.blur(email);
    expect(screen.getByRole("alert")).toHaveTextContent(/valid email/i);
  });

  it("sends the message for this doctor with a normalised phone and thanks the patient", async () => {
    render(<ContactQueryForm />);
    fill("  Sunita  ", "9876543210", " Is the clinic open on Sundays? ");
    send();
    await waitFor(() => expect(fn.invoke).toHaveBeenCalledTimes(1));
    const [name, options] = fn.invoke.mock.calls[0];
    expect(name).toBe("submit-patient-query");
    expect(options.body).toMatchObject({ doctor_id: "doc-1", name: "Sunita", message: "Is the clinic open on Sundays?", email: null });
    expect(String(options.body.phone)).toContain("9876543210");
    expect(await screen.findByText("Message sent")).toBeInTheDocument();
  });

  it("pretends success but sends nothing when the hidden honeypot field is filled (a bot)", async () => {
    render(<ContactQueryForm />);
    fill("Bot", "9876543210", "buy now");
    fireEvent.change(document.getElementById("query-website")!, { target: { value: "http://spam.test" } });
    send();
    expect(await screen.findByText("Message sent")).toBeInTheDocument();
    expect(fn.invoke).not.toHaveBeenCalled();
  });

  it("keeps the form filled in and explains when the server refuses", async () => {
    fn.invoke.mockResolvedValue({ data: null, error: { message: "boom" } });
    render(<ContactQueryForm />);
    fill("Sunita", "9876543210", "Hello");
    send();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByText("Message sent")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Your name/)).toHaveValue("Sunita");
  });

  describe("team clinic", () => {
    const docs = [
      { id: "pa", display_name: "Asha Rao", specialization: "Cardiology" },
      { id: "pb", display_name: "Dr. Vikram Shah", specialization: null },
    ];
    beforeEach(() => {
      vi.mocked(useDoctorData).mockReturnValue({ profile: { id: "doc-1" }, isTeamClinic: true, practitioners: docs } as never);
    });

    it("offers an optional 'Who would you like to consult?' with no preference first", () => {
      render(<ContactQueryForm />);
      const select = screen.getByLabelText(/Who would you like to consult/) as HTMLSelectElement;
      expect(select.value).toBe("");
      expect(screen.getByRole("option", { name: "No preference" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Dr. Asha Rao (Cardiology)" })).toBeInTheDocument();
    });

    it("sends the message unchanged when no doctor is chosen", async () => {
      render(<ContactQueryForm />);
      fill("Sunita", "9876543210", "Hello");
      send();
      await waitFor(() => expect(fn.invoke).toHaveBeenCalled());
      expect(fn.invoke.mock.calls[0][1].body).toEqual(expect.objectContaining({ message: "Hello" }));
      expect(fn.invoke.mock.calls[0][1].body).not.toHaveProperty("practitioner_id");
    });

    it("carries a chosen doctor as the first line of the message (the table has no doctor column)", async () => {
      render(<ContactQueryForm />);
      fireEvent.change(screen.getByLabelText(/Who would you like to consult/), { target: { value: "pb" } });
      fill("Sunita", "9876543210", "Hello");
      send();
      await waitFor(() => expect(fn.invoke).toHaveBeenCalled());
      expect(fn.invoke.mock.calls[0][1].body.message).toBe("For Dr. Vikram Shah:" + String.fromCharCode(10) + "Hello");
    });

    it("keeps the 1000-character limit including the doctor line", () => {
      render(<ContactQueryForm />);
      fireEvent.change(screen.getByLabelText(/Who would you like to consult/), { target: { value: "pb" } });
      expect(screen.getByLabelText(/^Your message/)).toHaveAttribute("maxlength", String(1000 - "For Dr. Vikram Shah:_".length));
    });

    it("is not shown outside a team clinic", () => {
      vi.mocked(useDoctorData).mockReturnValue({ profile: { id: "doc-1" }, isTeamClinic: false, practitioners: docs } as never);
      render(<ContactQueryForm />);
      expect(screen.queryByLabelText(/Who would you like to consult/)).not.toBeInTheDocument();
    });
  });
});
