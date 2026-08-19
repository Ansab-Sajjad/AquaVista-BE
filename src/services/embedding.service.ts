import { GoogleGenAI } from "@google/genai";
import mongoose from "mongoose";
import { DocumentChunk } from "../models/DocumentChunk.model";
import logger from "../config/logger";

/**
 * Text chunking configuration.
 * Chunks are created with overlap to preserve context across boundaries.
 */
const CHUNK_CHAR_SIZE = 1000;
const CHUNK_OVERLAP = 200;

/**
 * Gemini embedding model — text-embedding-004 is the current stable model.
 * Can be overridden via GEMINI_EMBEDDING_MODEL env var.
 */
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";

/**
 * Maximum number of texts to embed in a single API call.
 * The Gemini API supports batch embedding.
 */
const EMBED_BATCH_SIZE = 100;

/**
 * Splits text into overlapping chunks of approximately CHUNK_CHAR_SIZE characters.
 * Tries to break at sentence/paragraph boundaries when possible.
 */
export function chunkText(
  text: string,
  chunkSize: number = CHUNK_CHAR_SIZE,
  overlap: number = CHUNK_OVERLAP
): string[] {
  if (!text || text.trim().length === 0) return [];

  const cleaned = text.trim();
  if (cleaned.length <= chunkSize) return [cleaned];

  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    let end = start + chunkSize;

    // If not the last chunk, try to break at a sentence or paragraph boundary
    if (end < cleaned.length) {
      // Look for paragraph break first (within last 200 chars of the chunk)
      const paragraphBreak = cleaned.lastIndexOf("\n\n", end);
      if (paragraphBreak > start + chunkSize * 0.5) {
        end = paragraphBreak;
      } else {
        // Look for sentence boundary (. ! ? followed by space/newline)
        const sentenceEnd = Math.max(
          cleaned.lastIndexOf(". ", end),
          cleaned.lastIndexOf("! ", end),
          cleaned.lastIndexOf("? ", end),
          cleaned.lastIndexOf("\n", end)
        );
        if (sentenceEnd > start + chunkSize * 0.5) {
          end = sentenceEnd + 1;
        }
      }
    }

    const chunk = cleaned.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Move start forward, with overlap
    start = end - overlap;
    if (start < 0) start = 0;
    // Ensure we make progress
    if (start >= cleaned.length) break;
    if (chunks.length > 0 && start <= (chunks.length - 1) * (chunkSize - overlap)) {
      start = chunks.length * (chunkSize - overlap);
    }
  }

  return chunks;
}

/**
 * Generates embeddings for an array of text strings using the Gemini embedding API.
 * Processes in batches to stay within API limits.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured for embeddings");

  const ai = new GoogleGenAI({ apiKey });
  const allEmbeddings: number[][] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);

    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: batch,
      config: {
        taskType: "RETRIEVAL_DOCUMENT",
      },
    });

    const embeddings = response.embeddings || [];
    for (const emb of embeddings) {
      allEmbeddings.push(emb.values || []);
    }
  }

  return allEmbeddings;
}

/**
 * Generates an embedding for a single query string.
 * Uses RETRIEVAL_QUERY task type for search queries.
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured for embeddings");

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: query,
    config: {
      taskType: "RETRIEVAL_QUERY",
    },
  });

  return response.embeddings?.[0]?.values || [];
}

/**
 * Chunks and embeds a document's text, storing the results as DocumentChunk documents.
 * Deletes any existing chunks for the file first (supports re-extraction).
 */
export async function storeDocumentChunks(
  projectId: string,
  fileId: string,
  fileType: string,
  year: string | undefined,
  fileName: string,
  text: string
): Promise<number> {
  // Clean up existing chunks for this file
  await DocumentChunk.deleteMany({ file: fileId });

  if (!text || text.trim().length === 0) {
    logger.info(`No text to chunk for file ${fileId}`);
    return 0;
  }

  // Split text into chunks
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    logger.info(`No chunks generated for file ${fileId}`);
    return 0;
  }

  logger.info(`Chunking file ${fileId}: ${chunks.length} chunks from ${text.length} chars`);

  // Generate embeddings for all chunks
  const embeddings = await generateEmbeddings(chunks);

  if (embeddings.length !== chunks.length) {
    logger.warn(
      `Embedding count mismatch: ${embeddings.length} embeddings for ${chunks.length} chunks`
    );
  }

  // Store chunks with embeddings
  const docs: unknown[] = chunks.map((chunkText, i) => ({
    project: projectId,
    file: fileId,
    fileType,
    year: year || undefined,
    fileName,
    chunkIndex: i,
    text: chunkText,
    embedding: embeddings[i] || [],
  }));

  if (docs.length > 0) {
    await DocumentChunk.insertMany(docs);
  }

  logger.info(`Stored ${docs.length} DocumentChunks for file ${fileId}`);
  return docs.length;
}

/**
 * Deletes all DocumentChunks associated with a file.
 * Called when a file is deleted.
 */
export async function deleteDocumentChunks(fileId: string): Promise<void> {
  const result = await DocumentChunk.deleteMany({ file: fileId });
  if (result.deletedCount > 0) {
    logger.info(`Deleted ${result.deletedCount} DocumentChunks for file ${fileId}`);
  }
}

/**
 * Computes cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

export interface SearchResult {
  fileName: string;
  fileType: string;
  year?: string;
  chunkIndex: number;
  text: string;
  score: number;
}

/**
 * Searches for document chunks semantically similar to the query.
 * Embeds the query, then computes cosine similarity against all chunks
 * in the project, returning the top-K results.
 *
 * Note: This performs in-memory similarity computation. For large datasets,
 * consider migrating to MongoDB Atlas Vector Search ($vectorSearch).
 */
export async function searchDocuments(
  projectId: string,
  query: string,
  topK: number = 5
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  // Generate query embedding
  const queryEmbedding = await generateQueryEmbedding(query);

  if (queryEmbedding.length === 0) {
    logger.warn("Empty query embedding generated");
    return [];
  }

  // Load all chunks for the project (with embeddings)
  const chunks = await DocumentChunk.find({ project: projectId })
    .select("fileName fileType year chunkIndex text embedding")
    .lean();

  if (chunks.length === 0) return [];

  // Compute similarity scores
  const scored = chunks.map((chunk) => ({
    fileName: chunk.fileName,
    fileType: chunk.fileType,
    year: chunk.year,
    chunkIndex: chunk.chunkIndex,
    text: chunk.text,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  // Sort by score descending and take top K
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Returns summary info about embedded documents in a project.
 * Used by the data context builder to list available PDF documents.
 */
export async function getDocumentSummaries(
  projectId: string
): Promise<
  Array<{
    fileId: string;
    fileName: string;
    fileType: string;
    year?: string;
    chunkCount: number;
  }>
> {
  const results = await DocumentChunk.aggregate([
    { $match: { project: new mongoose.Types.ObjectId(projectId) } },
    {
      $group: {
        _id: "$file",
        fileName: { $first: "$fileName" },
        fileType: { $first: "$fileType" },
        year: { $first: "$year" },
        chunkCount: { $sum: 1 },
      },
    },
  ]);

  return results.map((r) => ({
    fileId: r._id.toString(),
    fileName: r.fileName,
    fileType: r.fileType,
    year: r.year,
    chunkCount: r.chunkCount,
  }));
}
