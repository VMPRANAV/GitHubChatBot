const { MemoryVectorStore } = require("@langchain/classic/vectorstores/memory");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { TaskType } = require("@google/generative-ai");

let vectorStore; 

// Helper to get embeddings only when needed (Lazy Initialization)
function getEmbeddingsModel() {
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
  const model = getEmbeddingsModel();
  vectorStore = await MemoryVectorStore.fromDocuments(documents, model);
  return vectorStore;
}

async function getContext(query) {
  if (!vectorStore) throw new Error("Vector Store not initialized");
  
  // Engineering Flex: Using Top 3 results to save tokens
  const results = await vectorStore.similaritySearch(query, 3);
  return results.map(doc => `Source: ${doc.metadata.source}\nContent: ${doc.pageContent}`).join("\n\n");
}

module.exports = { initializeVectorStore, getContext };