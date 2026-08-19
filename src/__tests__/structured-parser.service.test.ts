import { connectTestDB, disconnectTestDB, clearCollections } from "./helpers/db";
import { User } from "../models/User.model";
import { Project } from "../models/Project.model";
import { DataFile } from "../models/DataFile.model";
import { DataRecord } from "../models/DataRecord.model";
import {
  parseStructuredFile,
  storeDataRecords,
  deleteDataRecords,
  getDataFileSchemas,
  queryDataRecords,
  isStructuredFile,
} from "../services/structured-parser.service";
import { executeAvaTool } from "../services/ava-tools.service";

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

async function createStructuredDataFile(
  projectId: string,
  userId: string,
  overrides: Partial<{
    originalName: string;
    fileType: string;
    year: string;
    mimeType: string;
  }> = {}
) {
  return DataFile.create({
    project: projectId,
    name: overrides.originalName || "financials.csv",
    originalName: overrides.originalName || "financials.csv",
    fileType: overrides.fileType || "Financial Snapshot",
    year: overrides.year || "2024",
    uploadedBy: userId,
    mimeType: overrides.mimeType || "text/csv",
    sizeBytes: 100,
    status: "completed",
    extractedText: "Revenue,1000\nExpenses,800",
  });
}

// Helper: create a simple CSV buffer
function createCsvBuffer(content: string): Buffer {
  return Buffer.from(content, "utf-8");
}

describe("structured-parser.service", () => {
  describe("isStructuredFile", () => {
    it("returns true for CSV mime type", () => {
      expect(isStructuredFile("text/csv")).toBe(true);
    });

    it("returns true for Excel mime type", () => {
      expect(isStructuredFile("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(true);
    });

    it("returns false for PDF mime type", () => {
      expect(isStructuredFile("application/pdf")).toBe(false);
    });
  });

  describe("parseStructuredFile", () => {
    it("parses a CSV file into rows with named columns", async () => {
      const csv = "Revenue,Expenses,Net\n1000,800,200\n2000,1500,500";
      const buffer = createCsvBuffer(csv);

      const result = await parseStructuredFile(buffer, "text/csv");

      expect(result.sheets).toHaveLength(1);
      expect(result.sheets[0].columns).toEqual(["Revenue", "Expenses", "Net"]);
      expect(result.sheets[0].rows).toHaveLength(2);
      expect(result.sheets[0].rows[0]).toEqual({
        Revenue: "1000",
        Expenses: "800",
        Net: "200",
      });
      expect(result.sheets[0].rows[1]).toEqual({
        Revenue: "2000",
        Expenses: "1500",
        Net: "500",
      });
    });

    it("handles empty buffer gracefully", async () => {
      const result = await parseStructuredFile(Buffer.alloc(0), "text/csv");
      expect(result.sheets).toHaveLength(0);
    });

    it("returns empty sheets for unsupported mime type", async () => {
      const result = await parseStructuredFile(Buffer.from("test"), "application/pdf");
      expect(result.sheets).toHaveLength(0);
    });

    it("handles CSV with empty values", async () => {
      const csv = "A,B,C\n1,,3\n,,";
      const buffer = createCsvBuffer(csv);

      const result = await parseStructuredFile(buffer, "text/csv");

      // blankrows: false skips the all-empty row ",,"
      expect(result.sheets[0].rows).toHaveLength(1);
      expect(result.sheets[0].rows[0]).toEqual({ A: "1", B: "", C: "3" });
    });
  });

  describe("storeDataRecords", () => {
    it("stores rows as DataRecord documents", async () => {
      const { admin, project } = await seedProjectAndUser();
      const file = await createStructuredDataFile(project._id.toString(), admin._id.toString());

      const parsed = await parseStructuredFile(
        createCsvBuffer("Revenue,Expenses\n1000,800\n2000,1500"),
        "text/csv"
      );

      const count = await storeDataRecords(
        project._id.toString(),
        file._id.toString(),
        "Financial Snapshot",
        "2024",
        parsed
      );

      expect(count).toBe(2);
      const records = await DataRecord.find({ file: file._id }).lean();
      expect(records).toHaveLength(2);
      expect(records[0].rowNumber).toBe(1);
      expect(records[1].rowNumber).toBe(2);
    });

    it("deletes existing records before storing (re-extraction)", async () => {
      const { admin, project } = await seedProjectAndUser();
      const file = await createStructuredDataFile(project._id.toString(), admin._id.toString());

      // First store
      const parsed1 = await parseStructuredFile(
        createCsvBuffer("A,B\n1,2\n3,4\n5,6"),
        "text/csv"
      );
      await storeDataRecords(project._id.toString(), file._id.toString(), "Financial Snapshot", "2024", parsed1);
      expect(await DataRecord.countDocuments({ file: file._id })).toBe(3);

      // Re-store with different data
      const parsed2 = await parseStructuredFile(
        createCsvBuffer("A,B\n7,8"),
        "text/csv"
      );
      await storeDataRecords(project._id.toString(), file._id.toString(), "Financial Snapshot", "2024", parsed2);
      expect(await DataRecord.countDocuments({ file: file._id })).toBe(1);
    });

    it("skips completely empty rows", async () => {
      const { admin, project } = await seedProjectAndUser();
      const file = await createStructuredDataFile(project._id.toString(), admin._id.toString());

      const parsed = await parseStructuredFile(
        createCsvBuffer("A,B\n1,2\n,\n3,4"),
        "text/csv"
      );

      const count = await storeDataRecords(
        project._id.toString(),
        file._id.toString(),
        "Financial Snapshot",
        "2024",
        parsed
      );

      expect(count).toBe(2); // empty row skipped
    });
  });

  describe("deleteDataRecords", () => {
    it("deletes all DataRecords for a file", async () => {
      const { admin, project } = await seedProjectAndUser();
      const file = await createStructuredDataFile(project._id.toString(), admin._id.toString());

      const parsed = await parseStructuredFile(
        createCsvBuffer("A,B\n1,2\n3,4"),
        "text/csv"
      );
      await storeDataRecords(project._id.toString(), file._id.toString(), "Financial Snapshot", "2024", parsed);
      expect(await DataRecord.countDocuments({ file: file._id })).toBe(2);

      await deleteDataRecords(file._id.toString());
      expect(await DataRecord.countDocuments({ file: file._id })).toBe(0);
    });
  });

  describe("getDataFileSchemas", () => {
    it("returns schema info for structured files", async () => {
      const { admin, project } = await seedProjectAndUser();
      const file = await createStructuredDataFile(project._id.toString(), admin._id.toString(), {
        originalName: "financials.csv",
        fileType: "Financial Snapshot",
        year: "2024",
      });

      const parsed = await parseStructuredFile(
        createCsvBuffer("Revenue,Expenses,Net\n1000,800,200"),
        "text/csv"
      );
      await storeDataRecords(project._id.toString(), file._id.toString(), "Financial Snapshot", "2024", parsed);

      const schemas = await getDataFileSchemas(project._id.toString());

      expect(schemas).toHaveLength(1);
      expect(schemas[0].fileType).toBe("Financial Snapshot");
      expect(schemas[0].year).toBe("2024");
      expect(schemas[0].fileName).toBe("financials.csv");
      expect(schemas[0].columns).toEqual(expect.arrayContaining(["Revenue", "Expenses", "Net"]));
      expect(schemas[0].rowCount).toBe(1);
    });

    it("returns empty array when no structured files exist", async () => {
      const { admin, project } = await seedProjectAndUser();
      // Create a PDF file (not structured)
      await DataFile.create({
        project: project._id,
        name: "resolution.pdf",
        originalName: "resolution.pdf",
        fileType: "Rate Resolution",
        uploadedBy: admin._id,
        mimeType: "application/pdf",
        sizeBytes: 100,
        status: "completed",
        extractedText: "Some PDF text",
      });

      const schemas = await getDataFileSchemas(project._id.toString());
      expect(schemas).toHaveLength(0);
    });
  });

  describe("queryDataRecords", () => {
    beforeEach(async () => {
      const { admin, project } = await seedProjectAndUser();
      const projectId = project._id.toString();
      const adminId = admin._id.toString();

      // Create two structured files
      const file1 = await createStructuredDataFile(projectId, adminId, {
        originalName: "financials-2024.csv",
        fileType: "Financial Snapshot",
        year: "2024",
      });
      const parsed1 = await parseStructuredFile(
        createCsvBuffer("Category,Revenue,Expenses\nOperating,1000,800\nNon-Operating,200,100"),
        "text/csv"
      );
      await storeDataRecords(projectId, file1._id.toString(), "Financial Snapshot", "2024", parsed1);

      const file2 = await createStructuredDataFile(projectId, adminId, {
        originalName: "financials-2023.csv",
        fileType: "Financial Snapshot",
        year: "2023",
      });
      const parsed2 = await parseStructuredFile(
        createCsvBuffer("Category,Revenue,Expenses\nOperating,900,700\nNon-Operating,150,80"),
        "text/csv"
      );
      await storeDataRecords(projectId, file2._id.toString(), "Financial Snapshot", "2023", parsed2);
    });

    it("returns all records when no filters provided", async () => {
      // Data was seeded in beforeEach
      const result = await queryDataRecords(
        (await Project.findOne({ name: "Test Project" }))!._id.toString(),
        {}
      );

      expect(result.rows).toHaveLength(4);
      expect(result.totalMatched).toBe(4);
      expect(result.truncated).toBe(false);
    });

    it("filters by year", async () => {
      const projectId = (await Project.findOne({ name: "Test Project" }))!._id.toString();
      const result = await queryDataRecords(projectId, { year: "2024" });

      expect(result.rows).toHaveLength(2);
      expect(result.totalMatched).toBe(2);
      expect(result.rows[0]).toHaveProperty("Revenue");
    });

    it("filters by fileType", async () => {
      const projectId = (await Project.findOne({ name: "Test Project" }))!._id.toString();
      const result = await queryDataRecords(projectId, { fileType: "Financial Snapshot" });

      expect(result.rows).toHaveLength(4);
    });

    it("filters by column value (exact match)", async () => {
      const projectId = (await Project.findOne({ name: "Test Project" }))!._id.toString();
      const result = await queryDataRecords(projectId, {
        columnFilters: [{ column: "Category", value: "Operating" }],
      });

      expect(result.rows).toHaveLength(2);
      expect(result.rows.every((r) => r.Category === "Operating")).toBe(true);
    });

    it("filters by column value (contains match)", async () => {
      const projectId = (await Project.findOne({ name: "Test Project" }))!._id.toString();
      const result = await queryDataRecords(projectId, {
        columnFilters: [{ column: "Category", value: "operating", match: "contains" }],
      });

      // "Operating" and "Non-Operating" both contain "operating" (case-insensitive)
      expect(result.rows).toHaveLength(4);
    });

    it("returns only requested columns", async () => {
      const projectId = (await Project.findOne({ name: "Test Project" }))!._id.toString();
      const result = await queryDataRecords(projectId, {
        columns: ["Revenue"],
        year: "2024",
      });

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toHaveProperty("Revenue");
      expect(result.rows[0]).not.toHaveProperty("Expenses");
    });

    it("respects limit and sets truncated flag", async () => {
      const projectId = (await Project.findOne({ name: "Test Project" }))!._id.toString();
      const result = await queryDataRecords(projectId, { limit: 1 });

      expect(result.rows).toHaveLength(1);
      expect(result.totalMatched).toBe(4);
      expect(result.truncated).toBe(true);
    });
  });
});

describe("ava-tools.service", () => {
  describe("executeAvaTool", () => {
    it("executes listDataFiles and returns schemas", async () => {
      const { admin, project } = await seedProjectAndUser();
      const file = await createStructuredDataFile(project._id.toString(), admin._id.toString());

      const parsed = await parseStructuredFile(
        createCsvBuffer("Revenue,Expenses\n1000,800"),
        "text/csv"
      );
      await storeDataRecords(project._id.toString(), file._id.toString(), "Financial Snapshot", "2024", parsed);

      const result = await executeAvaTool("listDataFiles", {}, project._id.toString());
      const files = result.files as Array<{ fileType: string; columns: string[] }>;

      expect(files).toBeDefined();
      expect(files).toHaveLength(1);
      expect(files[0].fileType).toBe("Financial Snapshot");
      expect(files[0].columns).toEqual(expect.arrayContaining(["Revenue", "Expenses"]));
    });

    it("executes queryDataRecords and returns rows", async () => {
      const { admin, project } = await seedProjectAndUser();
      const file = await createStructuredDataFile(project._id.toString(), admin._id.toString());

      const parsed = await parseStructuredFile(
        createCsvBuffer("Category,Revenue\nOperating,1000\nNon-Operating,200"),
        "text/csv"
      );
      await storeDataRecords(project._id.toString(), file._id.toString(), "Financial Snapshot", "2024", parsed);

      const result = await executeAvaTool(
        "queryDataRecords",
        { fileType: "Financial Snapshot", year: "2024" },
        project._id.toString()
      );

      expect(result.rows).toHaveLength(2);
      expect(result.totalMatched).toBe(2);
      expect(result.truncated).toBe(false);
    });

    it("returns error for unknown tool", async () => {
      const { project } = await seedProjectAndUser();
      const result = await executeAvaTool("unknownTool", {}, project._id.toString());
      expect(result.error).toContain("Unknown tool");
    });

    it("returns empty files list when no structured data exists", async () => {
      const { admin, project } = await seedProjectAndUser();
      // Create only a PDF file
      await DataFile.create({
        project: project._id,
        name: "doc.pdf",
        originalName: "doc.pdf",
        fileType: "Rate Resolution",
        uploadedBy: admin._id,
        mimeType: "application/pdf",
        sizeBytes: 100,
        status: "completed",
        extractedText: "PDF text",
      });

      const result = await executeAvaTool("listDataFiles", {}, project._id.toString());
      expect(result.files).toHaveLength(0);
    });
  });
});
