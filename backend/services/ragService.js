const { MemoryVectorStore } = require("@langchain/classic/vectorstores/memory");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { TaskType } = require("@google/generative-ai");
const { reRankDocs } = require('./llmService');
const Chunk = require('../models/chunk.model');

let vectorStore; 

// Helper to get embeddings only when needed (Lazy Initialization)
async function getEmbeddingsModel() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is missing from process.env. Check your .env file.");
  }
  return new GoogleGenerativeAIEmbeddings({
    apiKey: apiKey,
    model: "gemini-embedding-001", // Use 004 for better code analysis than 001
    taskType: TaskType.RETRIEVAL_DOCUMENT,
    dimensions:768,
  });
}

async function initializeVectorStore(documents) {
  const model = await getEmbeddingsModel();
  vectorStore = await MemoryVectorStore.fromDocuments(documents, model);
  return vectorStore;
}

// backend/services/ragService.js
function normalizeScores(results) {
  if (results.length === 0) return [];
  const max = results[0].score || 1;
  const min = results[results.length - 1].score || 0;
  const range = max - min || 1;
  
  return results.map(res => ({
    ...res,
    normalizedScore: (res.score - min) / range
  }));
}
async function getContext(query) {
  if (!vectorStore) throw new Error("Vector Store not initialized");

  // STAGE 1: Vector Search (Top 20)
 // 1a. Vector Search (Top 15)
  const vectorDocs = await vectorStore.similaritySearchWithScore(query, 15);
  const normalizedVector = normalizeScores(vectorDocs.map(([doc, score]) => ({ ...doc, score })));

  // 1b. Keyword Search (Top 15)
  // Assumes a MongoDB text index on 'content'
  const keywordDocs = await Chunk.find(
    { $text: { $search: query } },
    { score: { $meta: "textScore" } }
  ).sort({ score: { $meta: "textScore" } }).limit(15);
  
  const normalizedKeyword = normalizeScores(keywordDocs.map(c => ({
    pageContent: c.content,
    metadata: { source: c.sourcePath, links: c.outboundLinks || [] },
    score: c._doc.score
  })));

  // 1c. Fusion Logic (Weighted Sum)
  // We give Keywords 70% weight for technical precision
  const fusionMap = new Map();
  const weightKeyword = 0.7;
  const weightVector = 0.3;

  [...normalizedVector, ...normalizedKeyword].forEach(doc => {
    const id = doc.metadata.source;
    const existing = fusionMap.get(id) || { ...doc, fusedScore: 0 };
    const contribution = doc.score ? (normalizedKeyword.includes(doc) ? weightKeyword : weightVector) : weightVector;
    existing.fusedScore += (doc.normalizedScore || 0) * contribution;
    fusionMap.set(id, existing);
  });

  const initialChunks = [...fusionMap.values()]
    .sort((a, b) => b.fusedScore - a.fusedScore)
    .slice(0, 20);
  // STAGE 2: Graph Expansion (Add Neighbors)
  // We find files that the top chunks depend on
const neighborPaths = [...new Set(initialChunks.flatMap(d => d.metadata.links || []))];
  
  // Fetch neighbor content from MongoDB
  const neighbors = await Chunk.find({
    sourcePath: { $in: neighborPaths },
    repoFullName: initialChunks[0].metadata.repoFullName // Ensure same repo
  }).limit(5);

  const allCandidates = [...initialChunks, ...neighbors.map(n => ({
    pageContent: n.content,
    metadata: { source: n.sourcePath }
  }))];

  const rankedResults = await reRankDocs(query, allCandidates.map(c => ({
    pageContent: c.pageContent,
    metadata: c.metadata
  })));
  const topN = rankedResults.slice(0, 5); // Final Context selection

  return topN.map(doc => {
    const source = doc.metadata ? doc.metadata.source : 'Unknown Source';
    return `Source: ${source}\nContent: ${doc.pageContent}`;
  }).join("\n\n");
}


module.exports = { initializeVectorStore, getContext,getEmbeddingsModel };