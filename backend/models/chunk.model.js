const mongoose = require('mongoose');

const chunkSchema = new mongoose.Schema({

  repoFullName: { type: String, required: true, index: true }, 
  content: { type: String, required: true },
  sourcePath: { type: String, required: true },
  outboundLinks: [{ type: String }],
  tokens: { type: Number },
  createdAt: { type: Date, default: Date.now }
});



const Chunk = mongoose.model('Chunk', chunkSchema);
module.exports = Chunk;