
# 🚀 GitChatBot: Repo Intelligence Assistant

GitChatBot is an advanced **Self-Correctional Adaptive Hybrid RAG Pipeline** designed to provide deep architectural insights into GitHub repositories. Unlike standard RAG systems, GitChatBot incorporates structural codebase awareness and autonomous search optimization to ensure high-precision technical answers.

## 🧠 Core AI Architecture
![GitHubChatBot Architecture](https://github.com/user-attachments/assets/e1a6c077-f984-45a2-a1a9-9068a7e739bb)
The system utilizes a 2026-standard multi-stage pipeline to bridge the gap between simple text retrieval and true code understanding:

1.  **Semantic Cache Gate**: Immediate response delivery for high-similarity queries (>0.95 cosine similarity) using MongoDB Vector Search.
2.  **Agentic Intent Guard**: A lightweight **Llama 3.1 8B** classifier that prevents expensive RAG operations on off-topic or irrelevant queries.
3.  **Hybrid Retrieval Engine**: Parallel execution of **Vector Search** (semantic concepts) and **Lexical Keyword Search** (exact identifiers) merged via **Relative Score Fusion (RSF)** with a 70% weight on technical keywords.
4.  **Graph Expansion**: Navigates the repository's structural dependencies by resolving relative imports to absolute paths and fetching neighboring file context.
5.  **Adaptive Self-Correction**: An autonomous loop that grades retrieval relevance and triggers a **Query Rewriter Agent** to optimize search terms if the initial search fails.
6.  **High-Reasoning Synthesis**: Final re-ranking and answer generation performed by **Llama 3.3 70B**, ensuring responses are grounded in actual code snippets with citations.

## ✨ Key Features

* **Glass-Box UI**: A real-time **Technical Trace** in the Streamlit frontend that shows the AI's "thought process" as it searches, grades, and rewrites queries.
* **Parallel Ingestion Engine**: Rapidly indexes repositories by processing files in parallel and distilling code to remove noise.
* **Dependency Mapping**: Automatically extracts outbound links between files to maintain structural context during retrieval.
* **Token Optimization**: Strategic use of smaller models for utility tasks (grading/guarding) and larger models for complex reasoning.

## 🛠️ Tech Stack

* **Frontend**: Streamlit (Python) with Server-Sent Events (SSE) streaming.
* **Backend**: Node.js & Express.
* **AI Models**: Llama 3.3 70B (Reasoning), Llama 3.1 8B (Utility), Gemini-Embedding-001.
* **Database**: MongoDB Atlas (Vector Search & Text Indexing).
* **Orchestration**: LangChain.

## 🚀 Getting Started

### Prerequisites
* Node.js v20+
* Python 3.10+
* MongoDB Atlas cluster with Vector Search enabled
* API Keys: Groq, Google Generative AI, and GitHub

### Installation
1. **Clone the repo**
2. **Setup Backend**
   ```bash
   cd backend
   npm install
   # Create .env with MONGO_URI, GITHUB_TOKEN, GOOGLE_API_KEY, GROQ_API_KEY
   node server.js
   ```
3. **Database Preparation**
   Run the following in your MongoDB shell to enable keyword search:
   ```javascript
   db.chunks.createIndex({ content: "text" });
   ```
4. **Setup Frontend**
   ```bash
   cd frontend
   pip install streamlit requests
   streamlit run app.py
   ```

## 🔒 Security & Privacy
* **Data Isolation**: Repository-level cache isolation prevents cross-project data leakage.
* **Scoped Access**: Uses read-only GitHub tokens for secure repository analysis.
* **PII Sanitization**: Designed to avoid persisting sensitive user information in the semantic cache.

