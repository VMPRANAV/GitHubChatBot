const express = require('express');
const router = express.Router();
const { ingestRepo } = require('../services/githubService');
const { initializeVectorStore, getContext } = require('../services/ragService');
// Import the new stream service function
const { getChatResponseStream } = require('../services/llmService'); 
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

// @route POST /api/repos/chat (Updated to SSE Streaming)
router.post('/chat', async (req, res) => {
  try {
    const { query } = req.body;
    
    // 1. Semantic Retrieval (Remains the same)
    const context = await getContext(query);
    
    // 2. Set Headers for Server-Sent Events (SSE)
    // This tells the browser to keep the connection open for a stream
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 3. Consume the Async Generator from llmService
    const stream = getChatResponseStream(query, context, currentRepoMetadata);
    
    for await (const chunk of stream) {
      // Data must be prefixed with 'data: ' and end with double newlines for SSE
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
    
    // 4. Signal the end of the stream
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    // If headers haven't been sent, we can send a 500. 
    // Otherwise, we send an error signal through the stream.
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

module.exports = router;