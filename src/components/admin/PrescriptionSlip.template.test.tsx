import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PrescriptionSlipCard, type PrescriptionSlipData } from "./PrescriptionSlip";
import { defaultTemplateConfig, TEMPLATE_PRESETS } from "@/lib/prescriptionTemplate/defaults";
import { newCustomBlock } from "@/lib/prescriptionTemplate/config";
import type { TemplateConfig } from "@/lib/prescriptionTemplate/types";

const profile = {
  full_name: "Test Doctor", specialization: "Dentist", qualifications: "BDS, MDS", registration_number: "DCI-77",
  clinic_name: "Madhuvan Dental", address: "10 Sethi Colony, Kota", phone: "9999999999", clinic_email: "c@example.test",
};

const rx = (over: Partial<PrescriptionSlipData> = {}): PrescriptionSlipData => ({
  id: "rx-1", patient_id: null, patient_name: "Harshit Bajaj", diagnosis: "Chronic irreversible pulpitis",
  medications: null,
  medicines: [{ name: "Ibuprofen", strength: "400 mg", morning: 1, afternoon: 0, evening: 1, durationDays: 3, food: "after" }],
  advice: null, diet_advice: null, lifestyle_advice: null, follow_up_date: null, follow_up_instructions: null,
  date: "2026-08-28", patient_age: 23, patient_weight: null, patient_gender: "male", visit: null, vitals: null,
  ...over,
});

const dental = () => TEMPLATE_PRESETS.find((p) => p.key === "dental")!.build();
const order = (container: HTMLElement, texts: string[]) =>
  texts.map((t) => container.textContent!.indexOf(t));

describe("PrescriptionSlipCard with a template", () => {
  it("prints answers to custom fields, and nothing for unanswered ones", () => {
    const { container } = render(
      <PrescriptionSlipCard
        profile={profile} template={dental()}
        prescription={rx({ extra: { cf_opd_no: "14023", cf_mlc: "No", cf_complaint: "Pain in upper and lower back teeth for 3-4 days", cf_investigations: ["IOPAR", "RVG"] } })}
      />,
    );
    expect(screen.getByText("OPD No. :")).toBeInTheDocument();
    expect(screen.getByText("14023")).toBeInTheDocument();
    expect(screen.getByText("MLC :")).toBeInTheDocument();
    expect(screen.getByText("Chief complaint")).toBeInTheDocument();
    expect(screen.getByText(/Pain in upper and lower back teeth/)).toBeInTheDocument();
    expect(screen.getByText("IOPAR, RVG")).toBeInTheDocument();
    // Unanswered: the label is not printed at all.
    expect(screen.queryByText("Allergies :")).not.toBeInTheDocument();
    expect(screen.queryByText("Referrals")).not.toBeInTheDocument();
    expect(container.querySelector("[data-tooth]")).toBeNull();
  });

  it("prints the tooth chart with the marked teeth and the pain scale with the chosen level", () => {
    const { container } = render(
      <PrescriptionSlipCard
        profile={profile} template={dental()}
        prescription={rx({ extra: { cf_teeth: { "16": "decayed", "36": "root_stump", "26": "restored" }, cf_pain: 3 } })}
      />,
    );
    expect(container.querySelectorAll("[data-tooth]")).toHaveLength(32);
    expect(within(container.querySelector('[data-tooth="16"]') as HTMLElement).getByText("D")).toBeInTheDocument();
    expect(within(container.querySelector('[data-tooth="36"]') as HTMLElement).getByText("RS")).toBeInTheDocument();
    expect(within(container.querySelector('[data-tooth="26"]') as HTMLElement).getByText("R")).toBeInTheDocument();
    expect(screen.getByText(/D = Decayed/)).toBeInTheDocument();
    expect(container.querySelector('[data-pain-level="3"]')).toHaveAttribute("data-selected", "true");
    expect(container.querySelectorAll("[data-selected]")).toHaveLength(1);
  });

  it("prints the sections in the template's order and skips switched-off ones", () => {
    const cfg = defaultTemplateConfig();
    cfg.blocks = [
      { id: "signature", type: "signature", enabled: true },
      { id: "medicines", type: "medicines", enabled: true },
      { id: "vitals", type: "vitals", enabled: false, fields: ["pulse"] },
      { id: "patient_info", type: "patient_info", enabled: false, fields: ["patient_name"] },
    ];
    const { container } = render(<PrescriptionSlipCard profile={profile} template={cfg} prescription={rx()} />);
    const [sig, med] = order(container, ["Signature", "Ibuprofen"]);
    expect(sig).toBeGreaterThan(-1);
    expect(sig).toBeLessThan(med);
    expect(screen.queryByText("Harshit Bajaj")).not.toBeInTheDocument(); // patient box off
  });

  it("the patient box shows only the chosen rows", () => {
    const cfg = defaultTemplateConfig();
    cfg.blocks = cfg.blocks.map((b) => (b.type === "patient_info" ? { ...b, fields: ["patient_name", "date"] } : b));
    render(<PrescriptionSlipCard profile={profile} template={cfg} prescription={rx()} />);
    expect(screen.getByText("Harshit Bajaj")).toBeInTheDocument();
    expect(screen.getByText("2026-08-28")).toBeInTheDocument();
    expect(screen.queryByText("Diagnosis")).not.toBeInTheDocument();
    expect(screen.queryByText("Age")).not.toBeInTheDocument();
  });

  it("prints the title, and the header/footer toggles hide the details they name", () => {
    const cfg = dental();
    cfg.header = { qualifications: false, registration: false, contact: false };
    cfg.footer = { address: false, qr: false };
    const { container } = render(<PrescriptionSlipCard profile={profile} template={cfg} prescription={rx()} />);
    expect(screen.getByText("OPD CARD")).toBeInTheDocument();
    expect(screen.getByText("Dr. Test Doctor", { selector: "h2" })).toBeInTheDocument();
    expect(screen.queryByText(/BDS, MDS/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Reg\. No\./)).not.toBeInTheDocument(); // header and signature
    expect(screen.queryByText("9999999999")).not.toBeInTheDocument();
    // No footer at all (nothing for the PDF pipeline to rasterize).
    expect(container.querySelector("[data-prescription-slip-footer]")).toBeNull();
  });

  it("pre-printed mode leaves blank space instead of the clinic header and footer", () => {
    const cfg: TemplateConfig = { ...defaultTemplateConfig(), letterhead: "preprinted", preprintedTopMm: 50, preprintedBottomMm: 20 };
    const { container } = render(<PrescriptionSlipCard profile={profile} template={cfg} prescription={rx()} />);
    const header = container.querySelector("[data-prescription-slip-header]") as HTMLElement;
    const footer = container.querySelector("[data-prescription-slip-footer]") as HTMLElement;
    // Sized as a share of the slip's width (the PDF scales by width), 193 mm being the printable A4 width.
    expect(header.style.aspectRatio.replace(/\s/g, "")).toBe("193/50");
    expect(footer.style.aspectRatio.replace(/\s/g, "")).toBe("193/20");
    expect(header.textContent).toBe("");
    expect(footer.textContent).toBe("");
    expect(screen.queryByText("Madhuvan Dental")).not.toBeInTheDocument();
    expect(screen.queryByText(/Scan to visit/)).not.toBeInTheDocument();
    // The body is still there for the PDF pipeline.
    expect(container.querySelector("[data-prescription-slip-body]")).not.toBeNull();
    expect(screen.getByText(/Ibuprofen/)).toBeInTheDocument();
  });

  it("the patient's page (forceLetterhead) still shows the clinic header and footer of a pre-printed layout", () => {
    const cfg: TemplateConfig = { ...defaultTemplateConfig(), letterhead: "preprinted" };
    render(<PrescriptionSlipCard profile={profile} template={cfg} prescription={rx()} forceLetterhead />);
    expect(screen.getByText("Dr. Test Doctor", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByText("Madhuvan Dental")).toBeInTheDocument();
  });

  it("a slip with no footer keeps bottom padding so the body is never flush or empty", () => {
    const cfg = defaultTemplateConfig();
    cfg.footer = { address: false, qr: false };
    const { container } = render(<PrescriptionSlipCard profile={profile} template={cfg} prescription={rx()} />);
    expect(container.querySelector("[data-prescription-slip-footer]")).toBeNull();
    expect(container.querySelector("[data-prescription-slip-body]")!.className).toMatch(/pb-6/);
    // With a footer the body is unchanged from the old slip.
    const { container: std } = render(<PrescriptionSlipCard profile={profile} prescription={rx()} />);
    expect(std.querySelector("[data-prescription-slip-body]")!.className).toBe("px-6 sm:px-8 ");
  });

  it("the pain scale keeps the chosen level visible when a browser drops backgrounds in print", () => {
    const { container } = render(
      <PrescriptionSlipCard profile={profile} template={dental()} prescription={rx({ extra: { cf_pain: 2 } })} />,
    );
    const on = container.querySelector('[data-pain-level="2"]') as HTMLElement;
    expect(on.style.borderWidth).toBe("3px");
    // (print-color-adjust itself is not modelled by jsdom, so only the border fallback is asserted.)
  });

  it("uses the layout the prescription was issued with when no template is passed", () => {
    const snapshot = dental();
    render(<PrescriptionSlipCard profile={profile} prescription={rx({ template_snapshot: snapshot, extra: { cf_opd_no: "77" } })} />);
    expect(screen.getByText("OPD CARD")).toBeInTheDocument();
    expect(screen.getByText("OPD No. :")).toBeInTheDocument();
  });

  it("the template prop wins over the snapshot (live preview)", () => {
    const cfg = defaultTemplateConfig();
    render(<PrescriptionSlipCard profile={profile} template={cfg} prescription={rx({ template_snapshot: dental(), extra: { cf_opd_no: "77" } })} />);
    expect(screen.queryByText("OPD CARD")).not.toBeInTheDocument();
    expect(screen.queryByText("OPD No. :")).not.toBeInTheDocument();
  });

  it("a prescription without a snapshot or with a garbage one renders the standard slip", () => {
    for (const snap of [undefined, null, "junk", { version: 9 }]) {
      const { unmount } = render(<PrescriptionSlipCard profile={profile} prescription={rx({ template_snapshot: snap })} />);
      expect(screen.getByText("Harshit Bajaj")).toBeInTheDocument();
      expect(screen.getByText("Scan to visit our website")).toBeInTheDocument();
      unmount();
    }
  });

  it("renders the accent colour only as a CSS colour (a malicious snapshot cannot inject markup)", () => {
    const evil = { ...defaultTemplateConfig(), accent: '"><img src=x onerror=alert(1)>' };
    const { container } = render(<PrescriptionSlipCard profile={profile} prescription={rx({ template_snapshot: evil })} />);
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).toHaveStyle({ color: "rgb(29, 78, 216)" });
  });

  it("escapes a custom field's text (shown as text, never as HTML)", () => {
    const cfg = defaultTemplateConfig();
    const b = newCustomBlock(cfg.blocks, "textarea", "Notes to patient");
    cfg.blocks.push(b);
    const { container } = render(
      <PrescriptionSlipCard profile={profile} template={cfg} prescription={rx({ extra: { [b.id]: "<img src=x onerror=alert(1)>" } })} />,
    );
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
  });
});

describe("PrescriptionSlipCard - built-in rows filled on the prescription, advice kinds and placed fields", () => {
  const VISIT = { visit_date: "2026-08-28", reason_for_visit: "From the visit", symptoms: "Visit symptoms" };
  const placedField = (cfg: TemplateConfig, label: string, where: "patient_info" | "vitals" | "advice", type: "text" | "number" | "textarea" = "text") => {
    const b = newCustomBlock(cfg.blocks, type, label, where);
    cfg.blocks.push(b);
    return b.id;
  };

  it("prints the complaint and symptoms typed on the prescription, ahead of the visit's", () => {
    render(
      <PrescriptionSlipCard
        profile={profile} prescription={rx({ visit: VISIT, extra: { sys_complaint: "Typed complaint", sys_symptoms: "Typed symptoms" } })}
      />,
    );
    expect(screen.getByText("Typed complaint")).toBeInTheDocument();
    expect(screen.getByText("Typed symptoms")).toBeInTheDocument();
    expect(screen.queryByText("From the visit")).not.toBeInTheDocument();
  });

  it("an older prescription still takes complaint, symptoms and vitals from its linked visit", () => {
    render(
      <PrescriptionSlipCard
        profile={profile}
        prescription={rx({ visit: VISIT, vitals: { blood_pressure: "110/70", pulse: 66, temperature: null, respiratory_rate: null, spo2: null, height: null, weight: 70, bmi: null } })}
      />,
    );
    expect(screen.getByText("From the visit")).toBeInTheDocument();
    expect(screen.getByText("Visit symptoms")).toBeInTheDocument();
    expect(screen.getByText("BP: 110/70")).toBeInTheDocument();
    expect(screen.getByText("Pulse: 66 bpm")).toBeInTheDocument();
    expect(screen.queryByText(/Weight: 70 kg/)).not.toBeInTheDocument(); // not offered by the standard template
  });

  it("prints vitals typed on the prescription, using the unit formats of the slip", () => {
    render(
      <PrescriptionSlipCard
        profile={profile}
        prescription={rx({ extra: { sys_vital_blood_pressure: "120/80", sys_vital_pulse: 72, sys_vital_temperature: 98.6, sys_vital_spo2: 98, sys_vital_height: 170, sys_vital_bmi: 24.2 } })}
      />,
    );
    for (const chip of ["BP: 120/80", "Pulse: 72 bpm", "Temp: 98.6°F", "SpO2: 98%", "Height: 170 cm", "BMI: 24.2"]) {
      expect(screen.getByText(chip)).toBeInTheDocument();
    }
  });

  it("a vital the template does not offer is not printed, and Weight prints once the template offers it", () => {
    const cfg = defaultTemplateConfig();
    const p = rx({ extra: { sys_vital_weight: 70, sys_vital_pulse: 72 } });
    const { unmount } = render(<PrescriptionSlipCard profile={profile} template={cfg} prescription={p} />);
    expect(screen.queryByText("Weight: 70 kg")).not.toBeInTheDocument();
    unmount();
    cfg.blocks = cfg.blocks.map((b) => (b.type === "vitals" ? { ...b, fields: ["pulse", "weight"] } : b));
    render(<PrescriptionSlipCard profile={profile} template={cfg} prescription={p} />);
    expect(screen.getByText("Weight: 70 kg")).toBeInTheDocument();
    expect(screen.queryByText("Temp: 98.6°F")).not.toBeInTheDocument();
  });

  it("prints only the kinds of advice the template offers", () => {
    const cfg = defaultTemplateConfig();
    cfg.blocks = cfg.blocks.map((b) => (b.type === "advice" ? { ...b, fields: ["general", "diet"] } : b));
    render(<PrescriptionSlipCard profile={profile} template={cfg} prescription={rx({ advice: "Rest", diet_advice: "Less salt", lifestyle_advice: "Walk daily" })} />);
    expect(screen.getByText("General Advice")).toBeInTheDocument();
    expect(screen.getByText("Diet Advice")).toBeInTheDocument();
    expect(screen.queryByText("Lifestyle Advice")).not.toBeInTheDocument();
    expect(screen.queryByText("Walk daily")).not.toBeInTheDocument();
  });

  it("a field placed in the patient box prints as a row of the box, not as a section of its own", () => {
    const cfg = defaultTemplateConfig();
    const id = placedField(cfg, "Occupation", "patient_info");
    const { container } = render(<PrescriptionSlipCard profile={profile} template={cfg} prescription={rx({ extra: { [id]: "Teacher" } })} />);
    const box = container.querySelector(".rounded-xl.border-2") as HTMLElement;
    expect(within(box).getByText("Occupation")).toBeInTheDocument();
    expect(within(box).getByText("Teacher")).toBeInTheDocument();
    expect(screen.queryByText("Occupation :")).not.toBeInTheDocument(); // the standalone style
  });

  it("a field placed in the vitals prints as a vital chip, and an unanswered one prints nothing", () => {
    const cfg = defaultTemplateConfig();
    const sugar = placedField(cfg, "Blood sugar", "vitals", "number");
    placedField(cfg, "Unanswered", "vitals", "number");
    render(<PrescriptionSlipCard profile={profile} template={cfg} prescription={rx({ extra: { [sugar]: 110 } })} />);
    expect(screen.getByText("Blood sugar: 110")).toBeInTheDocument();
    expect(screen.queryByText(/Unanswered/)).not.toBeInTheDocument();
  });

  it("a field placed in the advice prints as one more piece of advice", () => {
    const cfg = defaultTemplateConfig();
    const id = placedField(cfg, "Dental advice", "advice", "textarea");
    render(<PrescriptionSlipCard profile={profile} template={cfg} prescription={rx({ extra: { [id]: "Brush twice a day" } })} />);
    expect(screen.getByText("Dental advice")).toBeInTheDocument();
    expect(screen.getByText("Brush twice a day")).toBeInTheDocument();
  });

  it("placed fields go with their section: switched off, they are not printed", () => {
    const cfg = defaultTemplateConfig();
    const id = placedField(cfg, "Blood sugar", "vitals", "number");
    cfg.blocks = cfg.blocks.map((b) => (b.type === "vitals" ? { ...b, enabled: false } : b));
    render(<PrescriptionSlipCard profile={profile} template={cfg} prescription={rx({ extra: { [id]: 110 } })} />);
    expect(screen.queryByText(/Blood sugar/)).not.toBeInTheDocument();
  });
});
