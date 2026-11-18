import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import PatientImportDialog from "./PatientImportDialog";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));

const HEADER = "Name,Phone,Email,Age,Gender,Weight (kg),Notes";
const GOOD = `${HEADER}\nRavi Kumar,9876543210,,40,male,72.5,\nMeena Sharma,9876543211,,29,female,,`;

const csvFile = (text: string, name = "patients.csv") => new File([text], name, { type: "text/csv" });

const inserts = () =>
  mock.current.opsOf("patients").flatMap((q: any) => q.ops.filter((o: any[]) => o[0] === "insert").map((o: any[]) => o[1]));

const onImported = vi.fn();
const onOpenChange = vi.fn();

const renderDialog = () =>
  render(<PatientImportDialog open onOpenChange={onOpenChange} doctorId="doc-1" onImported={onImported} />);

const chooseFile = async (file: File) => {
  const input = (await screen.findByLabelText(/csv file/i)) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
};

describe("PatientImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.tables.patients = (ops: any[]) =>
      ops.some((o) => o[0] === "insert") ? { data: null, error: null } : { data: [], error: null };
  });
  afterEach(() => vi.restoreAllMocks());

  it("asks for a file and tells the user which columns are needed", async () => {
    renderDialog();
    expect(await screen.findByText(/import patients from csv/i)).toBeInTheDocument();
    expect(screen.getByText(/Name, Phone, Age and Gender/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download template/i })).toBeInTheDocument();
  });

  it("previews how many rows are ready, already exist, or have problems", async () => {
    mock.current.tables.patients = { data: [{ name: "Meena Sharma", phone: "9876543211" }], error: null };
    renderDialog();

    await chooseFile(csvFile(`${GOOD}\nBad Row,123,,40,male,,`));

    expect(await screen.findByText("1 ready to import")).toBeInTheDocument();
    expect(screen.getByText("1 already exist (skipped)")).toBeInTheDocument();
    expect(screen.getByText("1 with problems (skipped)")).toBeInTheDocument();
    expect(screen.getByText(/Line 4/)).toBeInTheDocument();
    expect(screen.getByText(/Bad Row/)).toBeInTheDocument();
    expect(screen.getByText(/10-digit Indian mobile/)).toBeInTheDocument();
    expect(inserts()).toHaveLength(0);
  });

  it("shows a file-level error and offers no import when a required column is missing", async () => {
    renderDialog();

    await chooseFile(csvFile("Name,Phone\nRavi,9876543210"));

    expect(await screen.findByText("Missing required column(s): Age, Gender")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^import \d+ patient/i })).not.toBeInTheDocument();
  });

  it("rejects a file that is too large without reading it", async () => {
    renderDialog();
    const big = csvFile(GOOD);
    Object.defineProperty(big, "size", { value: 3 * 1024 * 1024 });

    await chooseFile(big);

    expect(await screen.findByText(/larger than 2 MB/i)).toBeInTheDocument();
  });

  it("imports only the new rows for this doctor, then reports the result and refreshes the list", async () => {
    mock.current.tables.patients = (ops: any[]) =>
      ops.some((o) => o[0] === "insert")
        ? { data: null, error: null }
        : { data: [{ name: "Meena Sharma", phone: "9876543211" }], error: null };
    renderDialog();
    await chooseFile(csvFile(GOOD));

    fireEvent.click(await screen.findByRole("button", { name: "Import 1 patient" }));

    expect(await screen.findByText("Imported 1 patient")).toBeInTheDocument();
    expect(inserts()).toEqual([
      [{ doctor_id: "doc-1", name: "Ravi Kumar", phone: "9876543210", email: null, age: 40, gender: "male", weight: 72.5, notes: null }],
    ]);
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/1 skipped because they already exist/i)).toBeInTheDocument();
  });

  it("lets the user pick a different file from the preview", async () => {
    renderDialog();
    await chooseFile(csvFile(GOOD));
    await screen.findByText("2 ready to import");

    fireEvent.click(screen.getByRole("button", { name: /choose another file/i }));

    expect(await screen.findByLabelText(/csv file/i)).toBeInTheDocument();
    expect(screen.queryByText("2 ready to import")).not.toBeInTheDocument();
  });

  it("says so when the existing patient list cannot be checked, and does not offer to import", async () => {
    mock.current.tables.patients = { data: null, error: { message: "network" } };
    renderDialog();

    await chooseFile(csvFile(GOOD));

    expect(await screen.findByText(/could not check your existing patients/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^import \d+ patient/i })).not.toBeInTheDocument();
  });

  it("downloads a template with the importable columns", async () => {
    const blobs: Blob[] = [];
    (URL as any).createObjectURL = vi.fn((b: Blob) => (blobs.push(b), "blob:x"));
    (URL as any).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderDialog();

    fireEvent.click(await screen.findByRole("button", { name: /download template/i }));

    await waitFor(() => expect(blobs).toHaveLength(1));
    const text = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsText(blobs[0]);
    });
    expect(text).toContain("Name,Phone,Email,Age,Gender,Weight (kg),Notes");
  });
});
