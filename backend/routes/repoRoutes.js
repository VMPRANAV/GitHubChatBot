const express = require('express');
const router = express.Router();
const { ingestRepo } = require('../services/githubService');
const { initializeVectorStore, getContext } = require('../services/ragService');
// Import the new stream service function
const { getChatResponseStream, gradeRetrieval,rewriteQuery } = require('../services/llmService'); //
const { checkSemanticCache } = require('../services/cacheService');
const Chunk = require('../models/chunk.model');

let currentRepoMetadata = {};

// @route POST /api/repos/ingest (Stays Request-Response)
router.post('/ingest', async (req, res) => {
  try {
    const { owner, repo } = req.body;
    const { allDocs, metadata } = await ingestRepo(owner, repo);
    
    const chunksToSave = allDocs.map(doc => ({
      repoFullName: `${owner}/${repo}`,
      content: doc.pageContent,
      sourcePath: doc.metadata.source
    }));
    await Chunk.insertMany(chunksToSave);

    await initializeVectorStore(allDocs);
    currentRepoMetadata = metadata;

    res.json({ message: "Repo indexed and persisted successfully!", metadata });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// backend/routes/repoRoutes.js
// backend/routes/repoRoutes.js

router.post('/chat', async (req, res) => {
  try {
    const { query } = req.body;
    
    // Set headers early to support log streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 1. Semantic Cache Check
    res.write(`data: ${JSON.stringify({ log: "🔍 Checking semantic cache..." })}\n\n`);
    const cachedResponse = await checkSemanticCache(query); 
    
    if (cachedResponse) {
      res.write(`data: ${JSON.stringify({ text: "🚀 (Cached Answer) " + cachedResponse })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // 2. Initial Retrieval
    res.write(`data: ${JSON.stringify({ log: "📡 Performing Hybrid Search..." })}\n\n`);
    let context = await getContext(query);
    
    res.write(`data: ${JSON.stringify({ log: "⚖️ Grading context relevance..." })}\n\n`);
    let grade = await gradeRetrieval(query, context);

    // 3. ADAPTATION: Query Rewriting
    if (!grade.relevant) {
      res.write(`data: ${JSON.stringify({ log: "🔄 Relevance low. Rewriting query for better recall..." })}\n\n`);
      const finalQuery = await rewriteQuery(query);
      
      res.write(`data: ${JSON.stringify({ log: `🔎 Retrying with: "${finalQuery}"` })}\n\n`);
      context = await getContext(finalQuery);
      
      // Expand with Graph Expansion info
      res.write(`data: ${JSON.stringify({ log: "🌿 Following dependency graph edges..." })}\n\n`);
    }

    // 4. Stream Final Answer
    res.write(`data: ${JSON.stringify({ log: "✍️ Generating expert response..." })}\n\n`);
    const stream = getChatResponseStream(query, context, currentRepoMetadata);
    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
    
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error(error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});
module.exports = router;