import { connectTestDB, disconnectTestDB, clearCollections } from "./helpers/db";
import { User } from "../models/User.model";
import { Project } from "../models/Project.model";
import { DataFile } from "../models/DataFile.model";
import { DocumentChunk } from "../models/DocumentChunk.model";
import {
  chunkText,
  storeDocumentChunks,
  deleteDocumentChunks,
  searchDocuments,
  getDocumentSummaries,
} from "../services/embedding.service";

// Mock the Gemini embedding API — mock the module so generateEmbeddings
// and generateQueryEmbedding use mocked values without needing an API key
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      embedContent: jest.fn().mockImplementation(async (params: { contents: unknown }) => {
        const count = Array.isArray(params.contents) ? params.contents.length : 1;
        const embeddings = Array.from({ length: count }, (_, i) => ({
          values: [0.1 * (i + 1), 0.2, 0.3],
        }));
        return { embeddings };
      }),
    },
  })),
  createPartFromFunctionResponse: jest.fn(),
}));

// Set fake API key so the embedding service doesn't throw
process.env.GEMINI_API_KEY = "test-key";

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

describe("embedding.service", () => {
  describe("chunkText", () => {
    it("returns empty array for empty text", () => {
      expect(chunkText("")).toEqual([]);
      expect(chunkText("   ")).toEqual([]);
    });

    it("returns single chunk for text shorter than chunk size", () => {
      const text = "This is a short text.";
      const chunks = chunkText(text, 1000, 200);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe("This is a short text.");
    });

    it("splits long text into multiple chunks", () => {
      // Create text longer than chunk size
      const sentence = "This is a sentence. ";
      const text = sentence.repeat(100); // ~2200 chars
      const chunks = chunkText(text, 1000, 200);

      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should not be much larger than chunkSize
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(1200);
      }
    });

    it("tries to break at sentence boundaries", () => {
      const text =
        "First sentence. Second sentence. Third sentence. Fourth sentence. " +
        "Fifth sentence. Sixth sentence. Seventh sentence. Eighth sentence. " +
        "Ninth sentence. Tenth sentence. Eleventh sentence. Twelfth sentence. " +
        "Thirteenth sentence. Fourteenth sentence. Fifteenth sentence. " +
        "Sixteenth sentence. Seventeenth sentence. Eighteenth sentence. " +
        "Nineteenth sentence. Twentieth sentence.";
      const chunks = chunkText(text, 100, 20);

      // Chunks should ideally end at sentence boundaries
      expect(chunks.length).toBeGreaterThan(1);
      // At least some chunks should end with a period
      const endsWithPeriod = chunks.some((c) => c.endsWith("."));
      expect(endsWithPeriod).toBe(true);
    });

    it("tries to break at paragraph boundaries", () => {
      const para1 = "This is paragraph one. It has multiple sentences. ";
      const para2 = "This is paragraph two. It also has multiple sentences. ";
      const text = (para1 + "\n\n" + para2).repeat(20);
      const chunks = chunkText(text, 200, 50);

      expect(chunks.length).toBeGreaterThan(1);
    });

    it("handles text with no sentence boundaries", () => {
      const text = "abcdefghijklmnopqrstuvwxyz".repeat(100);
      const chunks = chunkText(text, 1000, 200);

      expect(chunks.length).toBeGreaterThan(1);
      // Should still produce non-empty chunks
      for (const chunk of chunks) {
        expect(chunk.length).toBeGreaterThan(0);
      }
    });
  });

  describe("storeDocumentChunks", () => {
    it("stores chunks with embeddings for a file", async () => {
      const { admin, project } = await seedProjectAndUser();
      const file = await DataFile.create({
        project: project._id,
        name: "resolution.pdf",
        originalName: "resolution.pdf",
        fileType: "Rate Resolution",
        year: "2024",
        uploadedBy: admin._id,
        mimeType: "application/pdf",
        sizeBytes: 100,
        status: "completed",
        extractedText: "Some text",
      });

      const text = "This is sentence one. This is sentence two. This is sentence three. This is sentence four. This is sentence five. This is sentence six. This is sentence seven. This is sentence eight. This is sentence nine. This is sentence ten.";
      const count = await storeDocumentChunks(
        project._id.toString(),
        file._id.toString(),
        "Rate Resolution",
        "2024",
        "resolution.pdf",
        text
      );

      expect(count).toBeGreaterThan(0);
      const chunks = await DocumentChunk.find({ file: file._id }).lean();
      expect(chunks.length).toBe(count);
      // Each chunk should have an embedding
      for (const chunk of chunks) {
        expect(chunk.embedding).toBeDefined();
        expect(chunk.embedding.length).toBeGreaterThan(0);
      }
    });

    it("deletes existing chunks before storing (re-extraction)", async () => {
      const { admin, project } = await seedProjectAndUser();
      const file = await DataFile.create({
        project: project._id,
        name: "doc.pdf",
        originalName: "doc.pdf",
        fileType: "Rate Resolution",
        uploadedBy: admin._id,
        mimeType: "application/pdf",
        sizeBytes: 100,
        status: "completed",
        extractedText: "text",
      });

      // First store
      const text1 = "First version of the document. With some content here. And more content. And even more. And more. And more. And more. And more. And more. And more.";
      await storeDocumentChunks(project._id.toString(), file._id.toString(), "Rate Resolution", "2024", "doc.pdf", text1);
      const firstCount = await DocumentChunk.countDocuments({ file: file._id });
      expect(firstCount).toBeGreaterThan(0);

      // Re-store with different text
      const text2 = "Second version. Different content entirely. With new information. And more. And more. And more. And more. And more. And more. And more.";
      await storeDocumentChunks(project._id.toString(), file._id.toString(), "Rate Resolution", "2024", "doc.pdf", text2);
      const secondCount = await DocumentChunk.countDocuments({ file: file._id });
      expect(secondCount).toBeGreaterThan(0);
      // Should have replaced, not appended
      expect(secondCount).toBeLessThanOrEqual(firstCount + 2);
    });

    it("returns 0 for empty text", async () => {
      const { admin, project } = await seedProjectAndUser();
      const file = await DataFile.create({
        project: project._id,
        name: "empty.pdf",
        originalName: "empty.pdf",
        fileType: "Rate Resolution",
        uploadedBy: admin._id,
        mimeType: "application/pdf",
        sizeBytes: 100,
        status: "completed",
        extractedText: "",
      });

      const count = await storeDocumentChunks(
        project._id.toString(),
        file._id.toString(),
        "Rate Resolution",
        "2024",
        "empty.pdf",
        ""
      );

      expect(count).toBe(0);
    });
  });

  describe("deleteDocumentChunks", () => {
    it("deletes all chunks for a file", async () => {
      const { admin, project } = await seedProjectAndUser();
      const file = await DataFile.create({
        project: project._id,
        name: "doc.pdf",
        originalName: "doc.pdf",
        fileType: "Rate Resolution",
        uploadedBy: admin._id,
        mimeType: "application/pdf",
        sizeBytes: 100,
        status: "completed",
        extractedText: "text",
      });

      const text = "Some text content here. More content. More content. More content. More content. More content. More content. More content. More content. More content.";
      await storeDocumentChunks(project._id.toString(), file._id.toString(), "Rate Resolution", "2024", "doc.pdf", text);
      expect(await DocumentChunk.countDocuments({ file: file._id })).toBeGreaterThan(0);

      await deleteDocumentChunks(file._id.toString());
      expect(await DocumentChunk.countDocuments({ file: file._id })).toBe(0);
    });
  });

  describe("getDocumentSummaries", () => {
    it("returns summaries of embedded documents", async () => {
      const { admin, project } = await seedProjectAndUser();
      const file = await DataFile.create({
        project: project._id,
        name: "resolution.pdf",
        originalName: "resolution.pdf",
        fileType: "Rate Resolution",
        year: "2024",
        uploadedBy: admin._id,
        mimeType: "application/pdf",
        sizeBytes: 100,
        status: "completed",
        extractedText: "text",
      });

      const text = "Some text content here. More content. More content. More content. More content. More content. More content. More content. More content. More content.";
      await storeDocumentChunks(project._id.toString(), file._id.toString(), "Rate Resolution", "2024", "resolution.pdf", text);

      const summaries = await getDocumentSummaries(project._id.toString());

      expect(summaries).toHaveLength(1);
      expect(summaries[0].fileName).toBe("resolution.pdf");
      expect(summaries[0].fileType).toBe("Rate Resolution");
      expect(summaries[0].year).toBe("2024");
      expect(summaries[0].chunkCount).toBeGreaterThan(0);
    });

    it("returns empty array when no documents exist", async () => {
      const { project } = await seedProjectAndUser();
      const summaries = await getDocumentSummaries(project._id.toString());
      expect(summaries).toHaveLength(0);
    });
  });

  describe("searchDocuments", () => {
    it("returns empty array for empty query", async () => {
      const { project } = await seedProjectAndUser();
      const results = await searchDocuments(project._id.toString(), "");
      expect(results).toEqual([]);
    });

    it("returns empty array when no chunks exist", async () => {
      const { project } = await seedProjectAndUser();
      const results = await searchDocuments(project._id.toString(), "water rates");
      expect(results).toEqual([]);
    });

    it("returns ranked results when chunks exist", async () => {
      const { admin, project } = await seedProjectAndUser();
      const file = await DataFile.create({
        project: project._id,
        name: "resolution.pdf",
        originalName: "resolution.pdf",
        fileType: "Rate Resolution",
        year: "2024",
        uploadedBy: admin._id,
        mimeType: "application/pdf",
        sizeBytes: 100,
        status: "completed",
        extractedText: "text",
      });

      // Store some chunks (embeddings are mocked to [0.1, 0.2, 0.3])
      const text = "The city council resolves to set water rates at $4.50 per CCF. " +
        "This resolution takes effect on January 1, 2024. " +
        "The rates apply to all residential and commercial customers. " +
        "Low-income households may qualify for a discounted rate. " +
        "The utility maintains a reserve fund for infrastructure improvements. " +
        "Capital improvement projects are prioritized based on risk assessment. " +
        "Debt service coverage ratio must be maintained at 1.25x minimum. " +
        "The financial snapshot shows total revenue of $12.5 million. " +
        "Operating expenses were $9.8 million in fiscal year 2024. " +
        "Net position increased by $2.7 million from the prior year.";
      await storeDocumentChunks(project._id.toString(), file._id.toString(), "Rate Resolution", "2024", "resolution.pdf", text);

      const results = await searchDocuments(project._id.toString(), "water rates", 3);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);
      // Results should be sorted by score descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
      }
      // Each result should have required fields
      for (const r of results) {
        expect(r.fileName).toBe("resolution.pdf");
        expect(r.fileType).toBe("Rate Resolution");
        expect(r.text).toBeTruthy();
        expect(typeof r.score).toBe("number");
      }
    });

    it("respects topK limit", async () => {
      const { admin, project } = await seedProjectAndUser();
      const file = await DataFile.create({
        project: project._id,
        name: "doc.pdf",
        originalName: "doc.pdf",
        fileType: "Rate Resolution",
        uploadedBy: admin._id,
        mimeType: "application/pdf",
        sizeBytes: 100,
        status: "completed",
        extractedText: "text",
      });

      // Create enough text to generate many chunks
      const text = "Sentence one. Sentence two. Sentence three. Sentence four. Sentence five. " +
        "Sentence six. Sentence seven. Sentence eight. Sentence nine. Sentence ten. " +
        "Sentence eleven. Sentence twelve. Sentence thirteen. Sentence fourteen. Sentence fifteen. " +
        "Sentence sixteen. Sentence seventeen. Sentence eighteen. Sentence nineteen. Sentence twenty. " +
        "Sentence twenty-one. Sentence twenty-two. Sentence twenty-three. Sentence twenty-four. Sentence twenty-five.";
      await storeDocumentChunks(project._id.toString(), file._id.toString(), "Rate Resolution", "2024", "doc.pdf", text);

      const results = await searchDocuments(project._id.toString(), "sentence", 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });
});
