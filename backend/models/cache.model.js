// backend/models/cache.model.js
const mongoose = require('mongoose');

const cacheSchema = new mongoose.Schema({
  query: { type: String, required: true },
  embedding: { type: [Number], required: true }, // Vector representation
  response: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Add a vector index in MongoDB Atlas for this collection later
module.exports = mongoose.model('Cache', cacheSchema);