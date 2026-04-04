const { Octokit } = require("@octokit/rest");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const path = require('path'); // Use the built-in path module for resolution

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

/**
 * Utility to turn relative imports into absolute repo paths.
 * Example: resolvePath('backend/routes/repoRoutes.js', '../services/llmService') 
 * Result: 'backend/services/llmService.js'
 */
function resolvePath(currentFilePath, importPath) {
  const dirname = path.dirname(currentFilePath);
  // Join the current directory with the relative import
  let resolved = path.join(dirname, importPath);
  
  // Standardize: Ensure it has a file extension for MongoDB matching
  if (!resolved.endsWith('.js') && !resolved.endsWith('.ts') && !resolved.endsWith('.tsx')) {
    resolved += '.js'; 
  }
  
  // Normalize slashes for cross-platform consistency in the database
  return resolved.replace(/\\/g, '/');
}

async function ingestRepo(owner, repo) {
  // 1. Get Repo Metadata
  const { data: info } = await octokit.repos.get({ owner, repo });
  const defaultBranch = info.default_branch;

  // 2. Fetch the ENTIRE file tree recursively
  const { data: treeData } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: defaultBranch,
    recursive: true,
  });

  // 3. Filter for supported code files
  const supportedFiles = treeData.tree.filter(item => 
    item.type === "blob" && 
    (item.path.endsWith('.js') || item.path.endsWith('.ts') || item.path.endsWith('.tsx') || item.path.endsWith('.md')) &&
    !item.path.includes('node_modules')
  ).slice(0, 50);

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 100,
  });

  // 4. Process files in Parallel (Ingest Parallelism)
  const docPromises = supportedFiles.map(async (file) => {
    try {
      const { data: fileData } = await octokit.repos.getContent({ owner, repo, path: file.path });
      const content = Buffer.from(fileData.content, 'base64').toString();
      
      // Engineering: Distillation
      const distilled = content.replace(/\n\s*\n/g, '\n');
      
      // --- GRAPH LOGIC: Dependency Extraction ---
      const importRegex = /(?:require\(|from\s+['"])([\.\/]+[^'"]+)/g;
      const rawLinks = [];
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        rawLinks.push(match[1]);
      }
      
      // Resolve relative paths to absolute repo paths
      const resolvedLinks = rawLinks.map(link => resolvePath(file.path, link));
      
      // Create documents with link metadata for Stage 2 Graph Expansion
      return await splitter.createDocuments(
        [distilled], 
        [{ source: file.path, links: resolvedLinks }]
      );
    } catch (e) {
      console.error(`Failed to process ${file.path}:`, e.message);
      return []; 
    }
  });

  const results = await Promise.all(docPromises); // High-speed parallel processing
  const allDocs = results.flat();
  
  return { 
    allDocs, 
    metadata: { language: info.language, description: info.description } 
  };
}

module.exports = { ingestRepo };