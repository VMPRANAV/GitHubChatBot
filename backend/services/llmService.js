const { Groq } = require('groq-sdk');

// Define the variable but don't initialize yet
let groqClient;

/**
 * Helper to get the Groq client only when needed.
 * This ensures process.env is fully populated by dotenv first.
 */
function getGroqClient() {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is missing from process.env. Check your .env file.");
    }
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}
async function gradeRetrieval(userQuery, context) {
  const client = getGroqClient();
  
  const graderPrompt = `
    SYSTEM: You are a strict relevance grader.
    TASK: Evaluate if the provided Context contains enough technical information to answer the User Query.
    
    Context:
    ${context}
    
    User Query: ${userQuery}
    
    Return ONLY a JSON object: {"relevant": true} or {"relevant": false}
  `;

  const response = await client.chat.completions.create({
    messages: [{ role: "user", content: graderPrompt }],
    model: "llama-3.3-70b-versatile",
    temperature: 0, // Deterministic for grading
    response_format: { type: "json_object" }
  });

  return JSON.parse(response.choices[0].message.content);
}
async function* getChatResponseStream(userQuery, context, repoMetadata) {
  // 1. Get the initialized client
  const client = getGroqClient();
  // llmService.js - Updated System Prompt
const systemPrompt = `
  You are an expert Senior Software Engineer and Technical Mentor. 
  Analyze the following GitHub repository: ${repoMetadata.description || 'Codebase'}.
  Primary Language: ${repoMetadata.language}.
  
  TASK:
  Explain the codebase logic clearly and provide relevant code snippets from the context.

  RULES:
  1. GUIDED EXPLANATION: Break down complex logic into step-by-step processes.
  2. CODE SNIPPETS: Always include 1-2 relevant code snippets from the provided Context to illustrate your point.
  3. GROUNDING: Use ONLY the provided code snippets. If information is missing, refer to the file tree.
  4. FORMATTING: Use Markdown for headers, bold text for key terms, and clean code blocks.
  5. CONTEXT: If the user asks "how", explain the flow of data between files.
`;

  const refinedContext = context.length > 8000 ? context.substring(0, 8000) + "..." : context;

  const stream = await client.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Context:\n${refinedContext}\n\nQuestion: ${userQuery}` }
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.2, 
    stream: true, 
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    if (content) {
      yield content;
    }
  }
}
/**
 * Query Rewriter: Transforms vague user questions into optimized technical search queries.
 */
async function rewriteQuery(originalQuery) {
  const client = getGroqClient();
  
  const rewriterPrompt = `
    SYSTEM: You are a Search Query Optimizer.
    TASK: Convert the User's question into a 3-5 word technical search query optimized for Vector Retrieval.
    Focus on: Method names, variable types, and architectural patterns.
    
    Original: ${originalQuery}
    
    Return ONLY the optimized string.
  `;

  const response = await client.chat.completions.create({
    messages: [{ role: "user", content: rewriterPrompt }],
    model: "llama-3.3-70b-versatile",
    temperature: 0.1
  });

  return response.choices[0].message.content.trim();
}
async function reRankDocs(query, docs) {
  const client = getGroqClient();
  const docsText = docs.map((d, i) => `ID ${i}: [${d.metadata.source}]\n${d.pageContent.substring(0, 300)}`).join("\n---\n");
  
  const rankingPrompt = `
    Query: ${query}
    Rank these code snippets by their ability to answer the query. 
    Return ONLY a comma-separated list of IDs in order of relevance.
  `;

  const response = await client.chat.completions.create({
    messages: [{ role: "user", content: rankingPrompt }],
    model: "llama-3.3-70b-versatile",
    temperature: 0
  });

  const order = response.choices[0].message.content.split(',').map(Number).filter(n => !isNaN(n));
  return order.map(index => docs[index]).filter(Boolean); // Add .filter(Boolean) to remove undefined
}
async function checkQueryIntent(query) {
  const client = getGroqClient();
  const response = await client.chat.completions.create({
    messages: [{ 
      role: "user", 
      content: `Is the following query related to software, coding, or repository analysis? Query: "${query}". Return a JSON object with a single key "relevant" (true or false).` 
    }],
    model: "llama-3.1-8b-instant", // Use a smaller, faster model here
    response_format: { type: "json_object" }
  });
  return JSON.parse(response.choices[0].message.content).relevant;
}

module.exports = { getChatResponseStream,gradeRetrieval,rewriteQuery,reRankDocs,checkQueryIntent};