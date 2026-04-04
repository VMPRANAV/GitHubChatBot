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

module.exports = { getChatResponseStream };