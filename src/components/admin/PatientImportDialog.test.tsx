import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

const ACCESS_OK = { eligible: true, reason: "ok", cap: 2000, patient_count: 10, remaining: 1990, max_rows: 1000 };
const OK_RESULT = (inserted: number) => ({ data: { ok: true, inserted, duplicates: 0, rejected: [], rejected_count: 0 }, error: null });

const importCalls = () =>
  mock.current.rpc.mock.calls.filter((c: any[]) => c[0] === "import_patients").map((c: any[]) => c[1]);
const accessCalls = () => mock.current.rpc.mock.calls.filter((c: any[]) => c[0] === "get_patient_import_access").length;
const inserts = () =>
  mock.current.opsOf("patients").flatMap((q: any) => q.ops.filter((o: any[]) => o[0] === "insert").map((o: any[]) => o[1]));

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

const onImported = vi.fn();
const onOpenChange = vi.fn();

const dialog = (open = true) => (
  <MemoryRouter>
    <PatientImportDialog open={open} onOpenChange={onOpenChange} doctorId="doc-1" onImported={onImported} />
  </MemoryRouter>
);
const renderDialog = () => render(dialog());

const chooseFile = async (file: File) => {
  const input = (await screen.findByLabelText(/csv file/i)) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
};

const clickImport = async () => fireEvent.click(await screen.findByRole("button", { name: /^import 2 patients/i }));

describe("PatientImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.rpcs.get_patient_import_access = () => ({ data: ACCESS_OK, error: null });
    mock.current.rpcs.import_patients = (args: any) => OK_RESULT(args._rows.length);
    mock.current.tables.patients = { data: [], error: null };
  });
  afterEach(() => vi.restoreAllMocks());

  it("asks for a file and tells the user which columns are needed", async () => {
    renderDialog();
    expect(await screen.findByText(/import patients from csv/i)).toBeInTheDocument();
    expect(screen.getByText(/Name, Phone, Age and Gender/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /download template/i })).toBeInTheDocument();
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
    expect(importCalls()).toHaveLength(0);
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

  it("rejects a file with more than 1000 rows", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => `Patient ${i},98${String(10000000 + i)},,40,male,,`);
    renderDialog();

    await chooseFile(csvFile(`${HEADER}\n${rows.join("\n")}`));

    expect(await screen.findByText(/1000|1,000/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^import \d+ patient/i })).not.toBeInTheDocument();
  });

  it("imports only the new rows through the server, then reports the result and refreshes the list", async () => {
    mock.current.tables.patients = { data: [{ name: "Meena Sharma", phone: "9876543211" }], error: null };
    renderDialog();
    await chooseFile(csvFile(GOOD));

    fireEvent.click(await screen.findByRole("button", { name: "Import 1 patient" }));

    expect(await screen.findByText("Imported 1 patient")).toBeInTheDocument();
    expect(inserts()).toHaveLength(0);
    expect(importCalls()).toHaveLength(1);
    expect(importCalls()[0]._file_name).toBe("patients.csv");
    expect(importCalls()[0]._rows).toEqual([
      { name: "Ravi Kumar", phone: "9876543210", email: null, age: 40, gender: "male", weight: 72.5, notes: null, patient_since: null, first_visit: null, last_visit: null, total_visits: 0 },
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

  describe("who may import", () => {
    it("tells a clinic on the wrong plan that import is a Pro and Premium feature, and offers no file picker", async () => {
      mock.current.rpcs.get_patient_import_access = () => ({ data: { eligible: false, reason: "plan" }, error: null });
      renderDialog();
      expect(await screen.findByText(/available on the pro and premium plans/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /view plans/i })).toHaveAttribute("href", "/admin/settings?tab=subscription");
      expect(screen.queryByLabelText(/csv file/i)).not.toBeInTheDocument();
    });

    it("tells a blocked clinic to contact support", async () => {
      mock.current.rpcs.get_patient_import_access = () => ({ data: { eligible: false, reason: "blocked" }, error: null });
      renderDialog();
      expect(await screen.findByText(/turned off for your clinic/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/csv file/i)).not.toBeInTheDocument();
    });

    it("tells staff without the add permission that they cannot import", async () => {
      mock.current.rpcs.get_patient_import_access = () => ({ data: { eligible: false, reason: "no_permission" }, error: null });
      renderDialog();
      expect(await screen.findByText(/do not have permission to import patients/i)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /view plans/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/csv file/i)).not.toBeInTheDocument();
    });

    it("does not guess when the access lookup fails, and can try again", async () => {
      mock.current.rpcs.get_patient_import_access = () => ({ data: null, error: { message: "down" } });
      renderDialog();
      expect(await screen.findByText(/could not check your import access/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/csv file/i)).not.toBeInTheDocument();

      mock.current.rpcs.get_patient_import_access = () => ({ data: ACCESS_OK, error: null });
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
      expect(await screen.findByLabelText(/csv file/i)).toBeInTheDocument();
    });

    it("shows a checking state, never the file picker, until the access lookup answers", async () => {
      const d = deferred<any>();
      mock.current.rpcs.get_patient_import_access = () => d.promise;
      renderDialog();
      expect(screen.getByText(/checking your plan/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/csv file/i)).not.toBeInTheDocument();
      await act(async () => d.resolve({ data: ACCESS_OK, error: null }));
      expect(await screen.findByLabelText(/csv file/i)).toBeInTheDocument();
    });
  });

  describe("how many more patients", () => {
    it("shows how many more patients the clinic can import", async () => {
      renderDialog();
      expect(await screen.findByText(/you can import up to 1,990 more patients/i)).toBeInTheDocument();
    });

    it("says the limit is reached when there is no room left, and treats a missing or negative number as none", async () => {
      for (const remaining of [0, -5, undefined]) {
        mock.current.rpcs.get_patient_import_access = () => ({ data: { ...ACCESS_OK, remaining }, error: null });
        const { unmount } = renderDialog();
        await chooseFile(csvFile(GOOD));
        expect(await screen.findByText(/this file adds 2 patients but your limit allows 0 more/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^import 2 patients/i })).toBeDisabled();
        unmount();
      }
    });

    it("disables Import when the file is bigger than the room left, and says why", async () => {
      mock.current.rpcs.get_patient_import_access = () => ({ data: { ...ACCESS_OK, remaining: 1 }, error: null });
      renderDialog();
      await chooseFile(csvFile(GOOD));
      expect(await screen.findByText(/this file adds 2 patients but your limit allows 1 more/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^import \d+ patient/i })).toBeDisabled();
    });

    it("offers the request form when the file is bigger than the room left, starting from what the file needs", async () => {
      mock.current.rpcs.get_patient_import_access = () => ({ data: { ...ACCESS_OK, cap: 11, patient_count: 10, remaining: 1 }, error: null });
      renderDialog();
      await chooseFile(csvFile(GOOD));
      expect(await screen.findByRole("button", { name: /send request/i })).toBeInTheDocument();
      expect((screen.getByLabelText(/patients you need to hold/i) as HTMLInputElement).value).toBe("12");
    });

    it("sends the request, then shows that it is waiting once the allowance refreshes", async () => {
      mock.current.rpcs.get_patient_import_access = () => ({ data: { ...ACCESS_OK, cap: 11, patient_count: 10, remaining: 1 }, error: null });
      mock.current.rpcs.request_patient_import_limit = () => {
        mock.current.rpcs.get_patient_import_access = () => ({ data: { ...ACCESS_OK, cap: 11, patient_count: 10, remaining: 1, pending_request: true }, error: null });
        return { data: { ok: true, id: "r1" }, error: null };
      };
      renderDialog();
      await chooseFile(csvFile(GOOD));
      const before = accessCalls();
      fireEvent.click(await screen.findByRole("button", { name: /send request/i }));
      expect(await screen.findByText(/request is waiting for review/i)).toBeInTheDocument();
      await waitFor(() => expect(accessCalls()).toBe(before + 1));
      expect(screen.getByText(/request is waiting for review/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /send request/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^import 2 patients/i })).toBeDisabled();
    });

    it("shows the waiting message instead of the form when a request already exists", async () => {
      mock.current.rpcs.get_patient_import_access = () => ({ data: { ...ACCESS_OK, remaining: 1, pending_request: true }, error: null });
      renderDialog();
      await chooseFile(csvFile(GOOD));
      expect(await screen.findByText(/this file adds 2 patients but your limit allows 1 more/i)).toBeInTheDocument();
      expect(screen.getByText(/request is waiting for review/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /send request/i })).not.toBeInTheDocument();
    });

    it("shows when the clinic can ask again instead of the form", async () => {
      mock.current.rpcs.get_patient_import_access = () => ({ data: { ...ACCESS_OK, remaining: 1, cooldown_until: "2099-12-01T00:00:00Z" }, error: null });
      renderDialog();
      await chooseFile(csvFile(GOOD));
      expect(await screen.findByText(/you can ask again on/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /send request/i })).not.toBeInTheDocument();
    });

    it("does not offer the request form when the file fits", async () => {
      renderDialog();
      await chooseFile(csvFile(GOOD));
      await screen.findByRole("button", { name: /^import 2 patients/i });
      expect(screen.queryByRole("button", { name: /send request/i })).not.toBeInTheDocument();
    });

    it("does not offer the request form to a clinic that cannot import", async () => {
      mock.current.rpcs.get_patient_import_access = () => ({ data: { eligible: false, reason: "plan", remaining: 0 }, error: null });
      renderDialog();
      await screen.findByRole("link", { name: /view plans/i });
      expect(screen.queryByRole("button", { name: /send request/i })).not.toBeInTheDocument();
    });

    it("allows a file that fills the remaining room exactly", async () => {
      mock.current.rpcs.get_patient_import_access = () => ({ data: { ...ACCESS_OK, remaining: 2 }, error: null });
      renderDialog();
      await chooseFile(csvFile(GOOD));
      expect(await screen.findByRole("button", { name: /^import 2 patients/i })).toBeEnabled();
      expect(screen.queryByText(/your limit allows/i)).not.toBeInTheDocument();
    });

    it("offers no import, and no limit warning, when every row already exists", async () => {
      mock.current.tables.patients = {
        data: [{ name: "Ravi Kumar", phone: "9876543210" }, { name: "Meena Sharma", phone: "9876543211" }],
        error: null,
      };
      mock.current.rpcs.get_patient_import_access = () => ({ data: { ...ACCESS_OK, remaining: 0 }, error: null });
      renderDialog();
      await chooseFile(csvFile(GOOD));
      expect(await screen.findByText("0 ready to import")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^import 0 patients/i })).toBeDisabled();
      expect(screen.queryByText(/your limit allows/i)).not.toBeInTheDocument();
    });
  });

  describe("when the server refuses or fails", () => {
    it("shows the server's reason, refreshes the allowance and stays usable", async () => {
      mock.current.rpcs.import_patients = () => ({ data: { ok: false, error: "CAP_EXCEEDED", cap: 10, current: 9, incoming: 2 }, error: null });
      renderDialog();
      await chooseFile(csvFile(GOOD));
      await screen.findByRole("button", { name: /^import 2 patients/i });
      const before = accessCalls();
      await clickImport();
      expect(await screen.findByText(/11 patients, above your limit of 10/)).toHaveAttribute("role", "alert");
      expect(onImported).not.toHaveBeenCalled();
      await waitFor(() => expect(accessCalls()).toBe(before + 1));
      expect(screen.getByRole("button", { name: /^import 2 patients/i })).toBeEnabled();
      expect(screen.getByRole("button", { name: /choose another file/i })).toBeInTheDocument();
    });

    it("shows the daily limit message and lets the user try again", async () => {
      mock.current.rpcs.import_patients = () => ({ data: { ok: false, error: "DAILY_LIMIT" }, error: null });
      renderDialog();
      await chooseFile(csvFile(GOOD));
      await clickImport();
      expect(await screen.findByText(/reached today's import limit/i)).toBeInTheDocument();
      await clickImport();
      await waitFor(() => expect(importCalls()).toHaveLength(2));
    });

    it("says the file is too large (not a row limit) when the server refuses a small payload", async () => {
      mock.current.rpcs.import_patients = () => ({ data: { ok: false, error: "PAYLOAD_INVALID", max_rows: 1000 }, error: null });
      renderDialog();
      await chooseFile(csvFile(GOOD));
      await clickImport();
      expect(await screen.findByText(/too large to import in one go/i)).toBeInTheDocument();
      expect(screen.queryByText(/at most 1,000 patients/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^import 2 patients/i })).toBeEnabled();
    });

    it("sends history columns exactly as read from the file", async () => {
      renderDialog();
      await chooseFile(csvFile(
        `${HEADER},Patient Since,First Visit,Last Visit,Total Visits\n` +
        "Ravi Kumar,9876543210,,40,male,72.5,diabetic,15/03/2019,15/03/2019,02/09/2025,14\n" +
        "Meena Sharma,9876543211,m@x.co,29,female,,,,,,",
      ));
      await clickImport();
      await screen.findByText("Imported 2 patients");
      expect(importCalls()[0]._rows).toEqual([
        { name: "Ravi Kumar", phone: "9876543210", email: null, age: 40, gender: "male", weight: 72.5, notes: "diabetic", patient_since: "2019-03-15", first_visit: "2019-03-15", last_visit: "2025-09-02", total_visits: 14 },
        { name: "Meena Sharma", phone: "9876543211", email: "m@x.co", age: 29, gender: "female", weight: null, notes: null, patient_since: null, first_visit: null, last_visit: null, total_visits: 0 },
      ]);
    });

    it("moves to the plan message when the server says the clinic is no longer eligible", async () => {
      mock.current.rpcs.import_patients = () => {
        mock.current.rpcs.get_patient_import_access = () => ({ data: { eligible: false, reason: "plan" }, error: null });
        return { data: { ok: false, error: "NOT_ELIGIBLE" }, error: null };
      };
      renderDialog();
      await chooseFile(csvFile(GOOD));
      await clickImport();
      expect(await screen.findByRole("link", { name: /view plans/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^import 2 patients/i })).not.toBeInTheDocument();
    });

    it("shows a general message when the server call itself fails", async () => {
      mock.current.rpcs.import_patients = () => ({ data: null, error: { message: "boom" } });
      renderDialog();
      await chooseFile(csvFile(GOOD));
      await clickImport();
      expect(await screen.findByText(/could not import\. please try again/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^import 2 patients/i })).toBeEnabled();
    });

    it("keeps the preview and the error when refreshing the allowance fails afterwards", async () => {
      mock.current.rpcs.import_patients = () => {
        mock.current.rpcs.get_patient_import_access = () => ({ data: null, error: { message: "down" } });
        return { data: { ok: false, error: "DAILY_LIMIT" }, error: null };
      };
      renderDialog();
      await chooseFile(csvFile(GOOD));
      const before = accessCalls();
      await clickImport();
      expect(await screen.findByText(/reached today's import limit/i)).toBeInTheDocument();
      await waitFor(() => expect(accessCalls()).toBe(before + 1));
      expect(screen.getByText(/reached today's import limit/i)).toBeInTheDocument();
      expect(screen.queryByText(/could not check your import access/i)).not.toBeInTheDocument();
    });

    it("clears the old message when another file is chosen", async () => {
      mock.current.rpcs.import_patients = () => ({ data: { ok: false, error: "DAILY_LIMIT" }, error: null });
      renderDialog();
      await chooseFile(csvFile(GOOD));
      await clickImport();
      await screen.findByText(/reached today's import limit/i);
      fireEvent.click(screen.getByRole("button", { name: /choose another file/i }));
      await screen.findByLabelText(/csv file/i);
      expect(screen.queryByText(/reached today's import limit/i)).not.toBeInTheDocument();
    });
  });

  describe("while importing", () => {
    it("sends only one import when Import is clicked twice quickly", async () => {
      const d = deferred<any>();
      mock.current.rpcs.import_patients = () => d.promise;
      renderDialog();
      await chooseFile(csvFile(GOOD));
      const btn = await screen.findByRole("button", { name: /^import 2 patients/i });
      fireEvent.click(btn);
      fireEvent.click(btn);
      expect(importCalls()).toHaveLength(1);
      await act(async () => d.resolve(OK_RESULT(2)));
      expect(await screen.findByText("Imported 2 patients")).toBeInTheDocument();
      expect(onImported).toHaveBeenCalledTimes(1);
    });

    it("does not close while importing", async () => {
      const d = deferred<any>();
      mock.current.rpcs.import_patients = () => d.promise;
      renderDialog();
      await chooseFile(csvFile(GOOD));
      await clickImport();
      expect(await screen.findByText("Importing 2 patients…")).toBeInTheDocument();
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(onOpenChange).not.toHaveBeenCalled();
      await act(async () => d.resolve(OK_RESULT(2)));
      await screen.findByText("Imported 2 patients");
    });

    it("keeps the result on screen even if the allowance refresh after the import fails", async () => {
      renderDialog();
      await chooseFile(csvFile(GOOD));
      const btn = await screen.findByRole("button", { name: /^import 2 patients/i });
      const before = accessCalls();
      mock.current.rpcs.get_patient_import_access = () => ({ data: null, error: { message: "down" } });
      fireEvent.click(btn);
      expect(await screen.findByText("Imported 2 patients")).toBeInTheDocument();
      await waitFor(() => expect(accessCalls()).toBe(before + 1));
      expect(screen.getByText("Imported 2 patients")).toBeInTheDocument();
      expect(screen.queryByText(/could not check your import access/i)).not.toBeInTheDocument();
    });
  });

  describe("closing and reopening", () => {
    it("starts clean when reopened: asks again and drops the old result", async () => {
      const view = render(dialog());
      await chooseFile(csvFile(GOOD));
      await clickImport();
      await screen.findByText("Imported 2 patients");

      view.rerender(dialog(false));
      const d = deferred<any>();
      mock.current.rpcs.get_patient_import_access = () => d.promise;
      view.rerender(dialog(true));

      expect(screen.getByText(/checking your plan/i)).toBeInTheDocument();
      expect(screen.queryByText("Imported 2 patients")).not.toBeInTheDocument();
      await act(async () => d.resolve({ data: { eligible: false, reason: "blocked" }, error: null }));
      expect(await screen.findByText(/turned off for your clinic/i)).toBeInTheDocument();
    });

    it("does not show an old lookup failure when reopened", async () => {
      mock.current.rpcs.get_patient_import_access = () => ({ data: null, error: { message: "down" } });
      const view = render(dialog());
      await screen.findByText(/could not check your import access/i);
      view.rerender(dialog(false));
      const d = deferred<any>();
      mock.current.rpcs.get_patient_import_access = () => d.promise;
      view.rerender(dialog(true));
      expect(screen.queryByText(/could not check your import access/i)).not.toBeInTheDocument();
      expect(screen.getByText(/checking your plan/i)).toBeInTheDocument();
      await act(async () => d.resolve({ data: ACCESS_OK, error: null }));
      expect(await screen.findByLabelText(/csv file/i)).toBeInTheDocument();
    });

    it("ignores an import that finishes after the dialog was closed and reopened, but still refreshes the list", async () => {
      const d = deferred<any>();
      mock.current.rpcs.import_patients = () => d.promise;
      const view = render(dialog());
      await chooseFile(csvFile(GOOD));
      await clickImport();
      await screen.findByText(/importing/i);

      view.rerender(dialog(false));
      view.rerender(dialog(true));
      await screen.findByLabelText(/csv file/i);

      await act(async () => d.resolve(OK_RESULT(2)));
      expect(onImported).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Imported 2 patients")).not.toBeInTheDocument();
      expect(screen.getByLabelText(/csv file/i)).toBeInTheDocument();
    });

    it("drops a file that finishes reading after the dialog was reopened", async () => {
      const d = deferred<any>();
      let calls = 0;
      mock.current.tables.patients = () => (++calls === 1 ? d.promise : { data: [], error: null });
      const view = render(dialog());
      await chooseFile(csvFile(GOOD));
      await screen.findByText(/reading file/i);

      view.rerender(dialog(false));
      view.rerender(dialog(true));
      await screen.findByLabelText(/csv file/i);

      await act(async () => d.resolve({ data: [], error: null }));
      expect(screen.queryByText("2 ready to import")).not.toBeInTheDocument();
      expect(screen.getByLabelText(/csv file/i)).toBeInTheDocument();
    });
  });

  describe("rejected rows", () => {
    it("lists rows the server rejected with their file line", async () => {
      mock.current.rpcs.import_patients = () => ({
        data: { ok: true, inserted: 1, duplicates: 0, rejected: [{ index: 2, error: "PHONE" }], rejected_count: 1 },
        error: null,
      });
      renderDialog();
      await chooseFile(csvFile(GOOD));
      await clickImport();
      expect(await screen.findByText("Imported 1 patient")).toBeInTheDocument();
      expect(screen.getByText(/1 row could not be saved/i)).toBeInTheDocument();
      expect(screen.getByText(/Line 3 · Meena Sharma/)).toBeInTheDocument();
      expect(screen.queryByText(/showing the first/i)).not.toBeInTheDocument();
    });

    it("reports the true number of rejected rows when the server lists only some of them", async () => {
      mock.current.rpcs.import_patients = () => ({
        data: { ok: true, inserted: 0, duplicates: 0, rejected: [{ index: 2, error: "PHONE" }], rejected_count: 150 },
        error: null,
      });
      renderDialog();
      await chooseFile(csvFile(GOOD));
      await clickImport();
      expect(await screen.findByText(/150 rows could not be saved/i)).toBeInTheDocument();
      expect(screen.getByText(/showing the first 1/i)).toBeInTheDocument();
      expect(screen.getByText(/Line 3 · Meena Sharma/)).toBeInTheDocument();
    });
  });
});
