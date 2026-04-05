// backend/services/cacheService.js
const Cache = require('../models/cache.model');
const { getEmbeddingsModel } = require('./ragService');

async function checkSemanticCache(query) {
  try {
    const model = await 
    getEmbeddingsModel();
    const queryEmbedding = await model.embedQuery(query);

    // Using MongoDB Vector Search to find similar previous questions
    // We look for an extremely high similarity (e.g., > 0.95)
    const similarityThreshold = 0.95;
    
    const results = await Cache.aggregate([
      {
        $vectorSearch: {
          index: "vector_index", 
          path: "embedding",
          queryVector: queryEmbedding,
          numCandidates: 10,
          limit: 1
        }
      },
      {
        $project: {
          response: 1,
          score: { $meta: "vectorSearchScore" }
        }
      }
    ]);

    if (results.length > 0 && results[0].score >= similarityThreshold) {
      return results[0].response;
    }
    
    return null; // No high-quality match found
  } catch (error) {
    console.error("Cache Check Error:", error);
    return null;
  }
}

module.exports = { checkSemanticCache };