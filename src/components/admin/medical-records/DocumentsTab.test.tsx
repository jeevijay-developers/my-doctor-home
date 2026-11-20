import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import DocumentsTab from "./DocumentsTab";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// A real-looking file: the first bytes decide the type, not the name.
const pdf = (name: string, lastModified = new Date("2021-03-05T10:00:00Z").getTime()) =>
  new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], name, { type: "application/pdf", lastModified });
const exe = (name: string) => new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], name, { type: "application/pdf" });

let upload: ReturnType<typeof vi.fn>;
let remove: ReturnType<typeof vi.fn>;

const setup = () => {
  mock.current = createTableMock();
  mock.current.tables.patient_documents = { data: [] };
  mock.current.tables.patient_visits = { data: [] };
  upload = vi.fn(async () => ({ error: null }));
  remove = vi.fn(async () => ({ error: null }));
  mock.current.client.storage = { from: vi.fn(() => ({ upload, remove, createSignedUrl: vi.fn() })) };
  const onChange = vi.fn();
  render(<DocumentsTab patientId="p1" doctorId="d1" onChange={onChange} />);
  return { onChange };
};

const openAndAdd = async (files: File[]) => {
  fireEvent.click(screen.getByRole("button", { name: /upload document/i }));
  const input = await screen.findByLabelText("Choose files");
  fireEvent.change(input, { target: { files } });
};

describe("DocumentsTab multi-file upload", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queues several files with a suggested type and the file's own date, and uploads them all", async () => {
    const { onChange } = setup();
    await openAndAdd([pdf("chest_xray.pdf"), pdf("CBC blood test.pdf")]);

    const list = await screen.findByRole("list", { name: /files to upload/i });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByLabelText("Date for chest_xray.pdf")).toHaveValue("2021-03-05");
    expect(screen.getByLabelText("Name for chest_xray.pdf")).toHaveValue("chest_xray");

    fireEvent.click(screen.getByRole("button", { name: /upload 2 documents/i }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));

    const inserts = mock.current.opsOf("patient_documents").filter((q: any) => q.ops.some((o: any) => o[0] === "insert"));
    const rows = inserts.map((q: any) => q.ops.find((o: any) => o[0] === "insert")[1]);
    expect(rows.map((r: any) => r.document_type)).toEqual(["xray", "lab_report"]);
    expect(rows.every((r: any) => r.doctor_id === "d1" && r.patient_id === "p1" && r.document_date === "2021-03-05")).toBe(true);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("refuses a file that is not really a PDF or image, whatever its name says", async () => {
    setup();
    await openAndAdd([exe("report.pdf"), pdf("ok.pdf")]);
    await screen.findByRole("list", { name: /files to upload/i });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByLabelText("Name for ok.pdf")).toBeInTheDocument();
  });

  it("keeps a failed file in the list for retry while the others are done", async () => {
    setup();
    upload.mockImplementation(async (path: string) => (path.includes("/p1/") && upload.mock.calls.length === 2 ? { error: { message: "network" } } : { error: null }));
    await openAndAdd([pdf("a.pdf"), pdf("b.pdf")]);
    await screen.findByRole("list", { name: /files to upload/i });

    fireEvent.click(screen.getByRole("button", { name: /upload 2 documents/i }));

    expect(await screen.findByText(/Could not upload file: network/)).toBeInTheDocument();
    expect(screen.getByLabelText("Uploaded")).toBeInTheDocument();
    expect(screen.getByLabelText("Failed")).toBeInTheDocument();
  });

  it("will not upload a file without a name", async () => {
    setup();
    await openAndAdd([pdf("a.pdf")]);
    fireEvent.change(await screen.findByLabelText("Name for a.pdf"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: /^upload document$/i }));
    await waitFor(() => expect(upload).not.toHaveBeenCalled());
  });

  it("offers a camera button that captures from the rear camera", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /upload document/i }));
    const camera = await screen.findByLabelText("Take photo", { selector: "input" });
    expect(camera).toHaveAttribute("capture", "environment");
  });
});
