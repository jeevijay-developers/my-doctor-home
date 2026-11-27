import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import TemplateEditor from "./TemplateEditor";
import { TEMPLATE_PRESETS, defaultTemplateConfig } from "@/lib/prescriptionTemplate/defaults";
import { isCustomBlock, type TemplateConfig } from "@/lib/prescriptionTemplate/types";

const h = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: h.error, success: h.success } }));
Element.prototype.scrollIntoView = vi.fn();

const profile = { full_name: "Test Doctor", clinic_name: "Test Clinic", address: "1 Main St", phone: "9999999999" };

const setup = (over: Partial<React.ComponentProps<typeof TemplateEditor>> = {}) => {
  const onSave = vi.fn(async () => null as string | null);
  const onCancel = vi.fn();
  render(
    <TemplateEditor
      initial={{ name: "Standard copy", preset: "general", config: defaultTemplateConfig(), practitioner_id: null, is_default: false }}
      profile={profile} doctors={[]} scopeLocked={false} onSave={onSave} onCancel={onCancel}
      {...over}
    />,
  );
  return { onSave, onCancel };
};
const saved = (onSave: ReturnType<typeof vi.fn>) => onSave.mock.calls[0][0] as {
  name: string; preset: string | null; config: TemplateConfig; practitioner_id: string | null; is_default: boolean;
};
const preview = () => screen.getByLabelText("Template preview");

describe("TemplateEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves the name, default flag and config", async () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "  My slip " } });
    fireEvent.click(screen.getByLabelText("Use as the default for new prescriptions"));
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(saved(onSave)).toMatchObject({ name: "  My slip ", preset: "general", practitioner_id: null, is_default: true });
    expect(saved(onSave).config).toEqual(defaultTemplateConfig());
    expect(h.success).toHaveBeenCalledWith("Template saved");
  });

  it("refuses an empty name without saving", async () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("Give the template a name."));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the error the save returns and stays open", async () => {
    const onSave = vi.fn(async () => "You can keep at most 20 templates. Delete one first.");
    setup({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("You can keep at most 20 templates. Delete one first."));
    expect(h.success).not.toHaveBeenCalled();
  });

  it("adds a custom field: it appears in the preview and in the saved config", async () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    // The new field's settings open straight away.
    fireEvent.change(screen.getByLabelText("Field name"), { target: { value: "OPD No." } });
    expect(within(preview()).getByText("OPD No. :")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const custom = saved(onSave).config.blocks.filter(isCustomBlock);
    expect(custom).toHaveLength(1);
    expect(custom[0]).toMatchObject({ label: "OPD No.", fieldType: "text", enabled: true, required: false });
    expect(custom[0].id).toMatch(/^cf_[a-z0-9]+$/);
  });

  it("refuses two fields with the same name (ignoring case)", async () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    fireEvent.change(screen.getByLabelText("Field name"), { target: { value: "Allergies" } });
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    // Only the newest field's settings are open.
    fireEvent.change(screen.getByLabelText("Field name"), { target: { value: "allergies" } });
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith(expect.stringMatching(/different names/i)));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("switching a section off removes it from the preview; moving one changes the saved order", async () => {
    const { onSave } = setup();
    expect(within(preview()).getByText(/Paracetamol/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Show Medicines" }));
    expect(within(preview()).queryByText(/Paracetamol/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Move Signature up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const types = saved(onSave).config.blocks.map((b) => b.type);
    expect(types.indexOf("signature")).toBeLessThan(types.indexOf("follow_up"));
    expect(saved(onSave).config.blocks.find((b) => b.type === "medicines")?.enabled).toBe(false);
  });

  it("will not save with every section switched off", async () => {
    const { onSave } = setup();
    for (const name of ["Patient details box", "Vitals (from the visit)", "Medicines", "Advice (general, diet, lifestyle)", "Follow-up", "Signature"]) {
      fireEvent.click(screen.getByRole("switch", { name: `Show ${name}` }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith(expect.stringMatching(/at least one section/i)));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("patient box rows can be switched off from the section's settings", async () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit Patient details box" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Weight" }));
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const info = saved(onSave).config.blocks.find((b) => b.type === "patient_info");
    expect(info && info.type === "patient_info" && info.fields).not.toContain("weight");
    expect(info && info.type === "patient_info" && info.fields).toContain("age");
  });

  it("title, accent colour and pre-printed spacing are saved; pre-printed hides the clinic header in the preview", async () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText(/Title under the header/), { target: { value: "OPD CARD" } });
    fireEvent.click(screen.getByRole("button", { name: "Accent #0f766e" }));
    expect(within(preview()).getByText("OPD CARD")).toBeInTheDocument();
    expect(within(preview()).getByText("Test Clinic")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox", { name: "Letterhead" }));
    fireEvent.click(await screen.findByRole("option", { name: /pre-printed stationery/ }));
    fireEvent.change(screen.getByLabelText("Space for header (mm)"), { target: { value: "60" } });
    expect(within(preview()).queryByText("Test Clinic")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Show website QR code")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saved(onSave).config).toMatchObject({ title: "OPD CARD", accent: "#0f766e", letterhead: "preprinted", preprintedTopMm: 60 });
  });

  it("the owner of a multi-doctor clinic can scope the template to one doctor; a doctor login cannot change scope", async () => {
    const { onSave } = setup({ doctors: [{ id: "pr-1", name: "Dr. Vikram Mehta" }] });
    fireEvent.click(screen.getByRole("combobox", { name: "Used by" }));
    fireEvent.click(await screen.findByRole("option", { name: "Dr. Vikram Mehta" }));
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saved(onSave).practitioner_id).toBe("pr-1");
  });

  it("a doctor login (scope locked) keeps their own scope and gets no scope picker", async () => {
    const onSave = vi.fn(async () => null as string | null);
    render(
      <TemplateEditor
        initial={{ name: "Mine", preset: null, config: TEMPLATE_PRESETS[0].build(), practitioner_id: "pr-me", is_default: true }}
        profile={profile} doctors={[{ id: "pr-me", name: "Dr. Me" }]} scopeLocked onSave={onSave} onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("combobox", { name: "Used by" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((onSave.mock.calls[0] as any[])[0].practitioner_id).toBe("pr-me");
  });

  it("cancel does not save", () => {
    const { onSave, onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
