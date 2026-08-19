import { connectTestDB, disconnectTestDB, clearCollections } from "./helpers/db";
import { User } from "../models/User.model";
import { Project } from "../models/Project.model";
import { DataFile } from "../models/DataFile.model";
import { DataRecord } from "../models/DataRecord.model";
import {
  getProjectDataContext,
  invalidateProjectDataContext,
} from "../services/data-context.service";

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

afterEach(async () => {
  await clearCollections();
});

async function seedProjectAndUser() {
  const admin = await User.create({
    name: "Admin",
    email: "admin@example.com",
    role: "admin",
    status: "active",
    authProvider: "local",
  });

  const project = await Project.create({
    name: "Test Project",
    municipality: "Test City",
    createdBy: admin._id,
    members: [{ user: admin._id }],
  });

  return { admin, project };
}

async function createDataFile(
  projectId: string,
  userId: string,
  overrides: Partial<{
    originalName: string;
    fileType: string;
    year: string;
    extractedText: string;
    status: string;
    mimeType: string;
  }> = {}
) {
  return DataFile.create({
    project: projectId,
    name: overrides.originalName || "test.xlsx",
    originalName: overrides.originalName || "test.xlsx",
    fileType: overrides.fileType || "Financial Snapshot",
    year: overrides.year || "2024",
    uploadedBy: userId,
    mimeType: overrides.mimeType || "text/csv",
    sizeBytes: 100,
    status: overrides.status || "completed",
    extractedText: overrides.extractedText || "Revenue,1000\nExpenses,800",
  });
}

// Helper: create a PDF file (unstructured — full text goes into context)
async function createPdfFile(
  projectId: string,
  userId: string,
  overrides: Partial<{
    originalName: string;
    fileType: string;
    year: string;
    extractedText: string;
  }> = {}
) {
  return DataFile.create({
    project: projectId,
    name: overrides.originalName || "resolution.pdf",
    originalName: overrides.originalName || "resolution.pdf",
    fileType: overrides.fileType || "Rate Resolution",
    year: overrides.year,
    uploadedBy: userId,
    mimeType: "application/pdf",
    sizeBytes: 100,
    status: "completed",
    extractedText: overrides.extractedText || "This is a rate resolution document.",
  });
}

// Helper: create DataRecords for a structured file (needed for schema summaries)
async function createDataRecordsForFile(
  projectId: string,
  fileId: string,
  fileType: string,
  year: string | undefined,
  rows: Record<string, string>[]
) {
  const docs = rows.map((row, i) => ({
    project: projectId,
    file: fileId,
    fileType,
    year,
    rowNumber: i + 1,
    columns: row,
  }));
  if (docs.length > 0) {
    await DataRecord.insertMany(docs);
  }
}

describe("data-context.service", () => {
  describe("getProjectDataContext", () => {
    it("returns a no-files message when project has no completed files", async () => {
      const { project } = await seedProjectAndUser();
      const context = await getProjectDataContext(project._id.toString());

      expect(context).toContain("No baseline data files");
    });

    it("builds context with PDF and structured file summaries (no full text)", async () => {
      const { admin, project } = await seedProjectAndUser();
      const projectId = project._id.toString();
      const adminId = admin._id.toString();

      // PDF file — only summary should appear, not full text
      await createPdfFile(projectId, adminId, {
        originalName: "resolution.pdf",
        fileType: "Rate Resolution",
        year: "2024",
        extractedText: "The city council resolves to set water rates at $4.50/CCF.",
      });

      // Structured file — only summary should appear, not raw data
      const csvFile = await createDataFile(projectId, adminId, {
        originalName: "financials.csv",
        fileType: "Financial Snapshot",
        year: "2024",
        extractedText: "Revenue,1000\nExpenses,800",
      });
      await createDataRecordsForFile(projectId, csvFile._id.toString(), "Financial Snapshot", "2024", [
        { Revenue: "1000", Expenses: "800" },
      ]);

      const context = await getProjectDataContext(projectId);

      expect(context).toContain("PROJECT BASELINE DATA");

      // PDF summary is included (but not full text)
      expect(context).toContain("Rate Resolution (2024)");
      expect(context).toContain("resolution.pdf");
      expect(context).toContain("PDF DOCUMENTS");
      // Full PDF text should NOT be in context
      expect(context).not.toContain("$4.50/CCF");

      // Structured file summary is included (but not raw extracted text)
      expect(context).toContain("Financial Snapshot (2024)");
      expect(context).toContain("financials.csv");
      expect(context).toContain("STRUCTURED DATA FILES");
      expect(context).toContain("columns: [Revenue, Expenses]");
      // Raw extracted text should NOT be in context for structured files
      expect(context).not.toContain("Revenue,1000\nExpenses,800");
    });

    it("caches the context on the Project document", async () => {
      const { admin, project } = await seedProjectAndUser();
      await createDataFile(project._id.toString(), admin._id.toString(), {
        extractedText: "Revenue,1000",
      });

      await getProjectDataContext(project._id.toString());

      const updated = await Project.findById(project._id).lean();
      expect(updated?.avaContextCache).toBeDefined();
      expect(updated?.avaContextCache?.context).toContain("PROJECT BASELINE DATA");
      expect(updated?.avaContextCache?.fileHash).toBeTruthy();
      expect(updated?.avaContextCache?.builtAt).toBeInstanceOf(Date);
    });

    it("returns cached context on second call without rebuilding", async () => {
      const { admin, project } = await seedProjectAndUser();
      await createDataFile(project._id.toString(), admin._id.toString(), {
        extractedText: "Revenue,1000",
      });

      const first = await getProjectDataContext(project._id.toString());
      const firstBuiltAt = (await Project.findById(project._id).lean())?.avaContextCache?.builtAt;

      // Small delay to ensure builtAt would differ if rebuilt
      await new Promise((r) => setTimeout(r, 50));

      const second = await getProjectDataContext(project._id.toString());
      const secondBuiltAt = (await Project.findById(project._id).lean())?.avaContextCache?.builtAt;

      expect(second).toBe(first);
      expect(secondBuiltAt).toEqual(firstBuiltAt);
    });

    it("rebuilds context when a new file is added", async () => {
      const { admin, project } = await seedProjectAndUser();
      await createDataFile(project._id.toString(), admin._id.toString(), {
        originalName: "file1.csv",
        extractedText: "Revenue,1000",
      });

      const first = await getProjectDataContext(project._id.toString());
      expect(first).toContain("file1.csv");
      expect(first).not.toContain("file2.csv");

      await createDataFile(project._id.toString(), admin._id.toString(), {
        originalName: "file2.csv",
        extractedText: "Expenses,800",
      });

      const second = await getProjectDataContext(project._id.toString());
      expect(second).toContain("file1.csv");
      expect(second).toContain("file2.csv");
      expect(second).not.toEqual(first);
    });

    it("rebuilds context when a file is deleted", async () => {
      const { admin, project } = await seedProjectAndUser();
      const file = await createDataFile(project._id.toString(), admin._id.toString(), {
        originalName: "file1.csv",
        extractedText: "Revenue,1000",
      });

      const first = await getProjectDataContext(project._id.toString());
      expect(first).toContain("file1.csv");

      await DataFile.findByIdAndDelete(file._id);

      const second = await getProjectDataContext(project._id.toString());
      expect(second).toContain("No baseline data files");
    });

    it("rebuilds context when a PDF file's extractedText changes", async () => {
      const { admin, project } = await seedProjectAndUser();
      const file = await createPdfFile(project._id.toString(), admin._id.toString(), {
        originalName: "resolution.pdf",
        fileType: "Rate Resolution",
        year: "2024",
        extractedText: "Water rate is $4.50 per CCF.",
      });

      const first = await getProjectDataContext(project._id.toString());
      const firstHash = (await Project.findById(project._id).lean())?.avaContextCache?.fileHash;
      // PDF summary includes the file name
      expect(first).toContain("resolution.pdf");
      // Full text is NOT in context (only summaries)
      expect(first).not.toContain("$4.50 per CCF");

      // Simulate re-extraction with different content (changes updatedAt)
      await DataFile.findByIdAndUpdate(file._id, {
        extractedText: "Water rate is $5.00 per CCF.",
      });

      const second = await getProjectDataContext(project._id.toString());
      const secondHash = (await Project.findById(project._id).lean())?.avaContextCache?.fileHash;
      // Context should be rebuilt (hash changes due to updatedAt change)
      expect(second).toContain("resolution.pdf");
      expect(secondHash).not.toEqual(firstHash);
    });

    it("ignores files that are not completed", async () => {
      const { admin, project } = await seedProjectAndUser();
      const adminId = admin._id.toString();
      const projectId = project._id.toString();
      await createDataFile(projectId, adminId, {
        originalName: "completed.csv",
        extractedText: "Revenue,1000",
        status: "completed",
      });
      await createDataFile(projectId, adminId, {
        originalName: "processing.csv",
        extractedText: "Expenses,800",
        status: "processing",
      });

      const context = await getProjectDataContext(project._id.toString());
      expect(context).toContain("completed.csv");
      expect(context).not.toContain("processing.csv");
    });

    it("sorts files deterministically by fileType, year (desc), then name", async () => {
      const { admin, project } = await seedProjectAndUser();

      // Insert in non-sorted order
      await createDataFile(project._id.toString(), admin._id.toString(), {
        originalName: "z-rate-table.csv",
        fileType: "Rate Table",
        year: "2023",
        extractedText: "Rate data 2023",
      });
      await createDataFile(project._id.toString(), admin._id.toString(), {
        originalName: "a-financials.csv",
        fileType: "Financial Snapshot",
        year: "2024",
        extractedText: "Financial 2024",
      });
      await createDataFile(project._id.toString(), admin._id.toString(), {
        originalName: "b-financials.csv",
        fileType: "Financial Snapshot",
        year: "2023",
        extractedText: "Financial 2023",
      });

      const context = await getProjectDataContext(project._id.toString());

      // Financial Snapshot (F) comes before Rate Table (R)
      const finPos = context.indexOf("Financial Snapshot");
      const ratePos = context.indexOf("Rate Table");
      expect(finPos).toBeGreaterThan(-1);
      expect(ratePos).toBeGreaterThan(-1);
      expect(finPos).toBeLessThan(ratePos);

      // Within Financial Snapshot, 2024 comes before 2023 (year desc)
      const fin2024Pos = context.indexOf("Financial Snapshot (2024)");
      const fin2023Pos = context.indexOf("Financial Snapshot (2023)");
      expect(fin2024Pos).toBeLessThan(fin2023Pos);
    });
  });

  describe("invalidateProjectDataContext", () => {
    it("clears the cached context", async () => {
      const { admin, project } = await seedProjectAndUser();
      await createDataFile(project._id.toString(), admin._id.toString(), {
        extractedText: "Revenue,1000",
      });

      await getProjectDataContext(project._id.toString());
      let cached = await Project.findById(project._id).lean();
      expect(cached?.avaContextCache).toBeDefined();

      await invalidateProjectDataContext(project._id.toString());
      cached = await Project.findById(project._id).lean();
      // $unset removes the field entirely (undefined), not null
      expect(cached?.avaContextCache).toBeFalsy();
    });

    it("forces a rebuild on next getProjectDataContext call", async () => {
      const { admin, project } = await seedProjectAndUser();
      await createDataFile(project._id.toString(), admin._id.toString(), {
        extractedText: "Revenue,1000",
      });

      await getProjectDataContext(project._id.toString());
      const firstBuiltAt = (await Project.findById(project._id).lean())?.avaContextCache?.builtAt;

      await new Promise((r) => setTimeout(r, 50));
      await invalidateProjectDataContext(project._id.toString());

      await getProjectDataContext(project._id.toString());
      const secondBuiltAt = (await Project.findById(project._id).lean())?.avaContextCache?.builtAt;

      expect(secondBuiltAt).not.toEqual(firstBuiltAt);
    });
  });
});
