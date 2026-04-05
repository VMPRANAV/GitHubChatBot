const express = require('express');
const router = express.Router();
const { ingestRepo } = require('../services/githubService');
const { initializeVectorStore, getContext, getEmbeddingsModel } = require('../services/ragService');
const { getChatResponseStream, gradeRetrieval, rewriteQuery, checkQueryIntent } = require('../services/llmService'); 
const { checkSemanticCache } = require('../services/cacheService');
const Chunk = require('../models/chunk.model');
const Cache = require('../models/cache.model');

let currentRepoMetadata = {};

// @route POST /api/repos/ingest
router.post('/ingest', async (req, res) => {
  try {
    const { owner, repo } = req.body;
    const { allDocs, metadata } = await ingestRepo(owner, repo);
    
    // Persist chunks to MongoDB for Hybrid/Keyword search
    const chunksToSave = allDocs.map(doc => ({
      repoFullName: `${owner}/${repo}`,
      content: doc.pageContent,
      sourcePath: doc.metadata.source,
      outboundLinks: doc.metadata.links || []
    }));
    
    await Chunk.deleteMany({ repoFullName: `${owner}/${repo}` }); // Clear old version
    await Chunk.insertMany(chunksToSave);

    // Initialize the in-memory Vector Store for semantic search
    await initializeVectorStore(allDocs);
    currentRepoMetadata = metadata;

    res.json({ message: "Repo indexed and persisted successfully!", metadata });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route POST /api/repos/chat
router.post('/chat', async (req, res) => {
  try {
    const { query } = req.body;
    
    // Set headers for Server-Sent Events (SSE) streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 1. Semantic Cache Check (Step 1: Stop early if answer is known)
    res.write(`data: ${JSON.stringify({ log: "🔍 Checking semantic cache..." })}\n\n`);
    const cachedResponse = await checkSemanticCache(query); 
    
    if (cachedResponse) {
      res.write(`data: ${JSON.stringify({ text: "🚀 (Cached Answer) " + cachedResponse })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // 2. Early Intent Guard (Step 2: Stop early if query is irrelevant)
    res.write(`data: ${JSON.stringify({ log: "🛡️ Verifying query intent..." })}\n\n`);
    const isRelevantIntent = await checkQueryIntent(query); 
    if (!isRelevantIntent) {
      res.write(`data: ${JSON.stringify({ text: "I'm a codebase assistant. Please ask questions related to this repository or software logic." })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // 3. Initial Retrieval
    res.write(`data: ${JSON.stringify({ log: "📡 Performing Hybrid Search (Vector + Keyword)..." })}\n\n`);
    let context = await getContext(query);
    
    res.write(`data: ${JSON.stringify({ log: "⚖️ Grading context relevance..." })}\n\n`);
    let grade = await gradeRetrieval(query, context);

    // 4. ADAPTATION: Query Rewriting
    if (!grade.relevant) {
      res.write(`data: ${JSON.stringify({ log: "🔄 Relevance low. Rewriting query for better recall..." })}\n\n`);
      const optimizedQuery = await rewriteQuery(query);
      
      res.write(`data: ${JSON.stringify({ log: `🔎 Retrying with: "${optimizedQuery}"` })}\n\n`);
      context = await getContext(optimizedQuery);
      
      res.write(`data: ${JSON.stringify({ log: "🌿 Following dependency graph edges..." })}\n\n`);
    }

    // 5. Stream Final Answer
    res.write(`data: ${JSON.stringify({ log: "✍️ Generating expert response..." })}\n\n`);
    
    let fullResponse = ""; // Accumulator for the cache
    const stream = getChatResponseStream(query, context, currentRepoMetadata);
    
    for await (const chunk of stream) {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }

    // 6. Complete the Loop: Save to Cache
    try {
      const model = await getEmbeddingsModel();
      const queryEmbedding = await model.embedQuery(query);

      await Cache.create({
        query: query,
        embedding: queryEmbedding,
        response: fullResponse
      });
      console.log("✅ Response saved to semantic cache.");
    } catch (cacheError) {
      console.error("⚠️ Cache save failed:", cacheError.message);
    }
    
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error("Critical Chat Error:", error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

module.exports = router;