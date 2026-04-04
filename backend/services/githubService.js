const { Octokit } = require("@octokit/rest");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

async function ingestRepo(owner, repo) {
  // 1. Get Repo Metadata and the default branch
  const { data: info } = await octokit.repos.get({ owner, repo });
  const defaultBranch = info.default_branch;

  // 2. Fetch the ENTIRE file tree recursively in ONE API call
  // This avoids the "N+1" problem of hitting each folder individually.
  const { data: treeData } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: defaultBranch,
    recursive: true,
  });

  // 3. Filter for supported code files across the whole project
  const supportedFiles = treeData.tree.filter(item => 
    item.type === "blob" && 
    (item.path.endsWith('.js') || item.path.endsWith('.ts') || item.path.endsWith('.tsx') || item.path.endsWith('.md')) &&
    !item.path.includes('node_modules') && // Standard exclusion
    !item.path.includes('dist')
  ).slice(0, 50); // Optional: Cap total files for the demo to prevent rate limits

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 100,
  });

  // 4. Process files in Parallel (Fast Ingestion)
  const docPromises = supportedFiles.map(async (file) => {
    try {
      const { data: fileData } = await octokit.repos.getContent({ owner, repo, path: file.path });
      const content = Buffer.from(fileData.content, 'base64').toString();
      
      // Engineering: Distillation
      const distilled = content.replace(/\n\s*\n/g, '\n');
      
      return await splitter.createDocuments([distilled], [{ source: file.path }]);
    } catch (e) {
      return []; // Skip files that fail to load
    }
  });

  const results = await Promise.all(docPromises);
  const allDocs = results.flat();
  
  return { allDocs, metadata: { language: info.language, description: info.description } };
}

module.exports = { ingestRepo };