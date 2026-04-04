import streamlit as st
import requests
import json
import re

# Page Config
st.set_page_config(page_title="GitChatBot AI", page_icon="🤖", layout="wide")

# Custom CSS for better chat UI
st.markdown("""
    <style>
    .stChatMessage { border-radius: 10px; margin-bottom: 10px; }
    .technical-trace { font-size: 0.85rem; color: #666; background-color: #f0f2f6; padding: 10px; border-radius: 5px; }
    </style>
    """, unsafe_allow_html=True) # Changed to unsafe_allow_html

st.title("🚀 GitChatBot: Repo Intelligence")
st.caption("Advanced Hybrid RAG with Graph Expansion & Semantic Caching")

# --- Helper Functions ---
def parse_github_url(url):
    """Parses GitHub URL to extract owner and repo name."""
    pattern = r"github\.com/([^/]+)/([^/]+)"
    match = re.search(pattern, url)
    if match:
        owner, repo = match.groups()
        return owner, repo.replace(".git", "")
    return None, None

# --- Sidebar: Ingestion ---
with st.sidebar:
    st.header("1. Ingest Repository")
    repo_url = st.text_input("GitHub Repository URL", placeholder="https://github.com/owner/repo")
    
    if st.button("Initialize Knowledge Base"):
        owner, repo = parse_github_url(repo_url)
        
        if owner and repo:
            with st.spinner(f"Analyzing {owner}/{repo}..."):
                try:
                    res = requests.post(
                        "http://localhost:3000/api/repos/ingest",
                        json={"owner": owner, "repo": repo},
                        timeout=120 # Ingestion can take time
                    )
                    if res.status_code == 200:
                        st.success(f"✅ {repo} Indexed!")
                        st.session_state['ingested'] = True
                        st.session_state['repo_name'] = f"{owner}/{repo}"
                    else:
                        st.error(f"Failed: {res.text}")
                except Exception as e:
                    st.error(f"Connection Error: {e}")
        else:
            st.warning("Please enter a valid GitHub URL.")
    
    if st.session_state.get('ingested'):
        st.info(f"Currently chatting with: **{st.session_state['repo_name']}**")
        if st.button("Clear Cache & Reset"):
            st.session_state.clear()
            st.rerun()

# --- Main Chat Interface ---
if "messages" not in st.session_state:
    st.session_state.messages = []

# Display chat history
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# Chat Input
if prompt := st.chat_input("Ask about function logic, dependencies, or architectural patterns..."):
    if not st.session_state.get('ingested'):
        st.warning("Please ingest a repository in the sidebar first!")
    else:
        # Add user message to UI
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)

        # Handle Streaming Response
        with st.chat_message("assistant"):
            # UI Placeholders for the "Glass Box" experience
            status_placeholder = st.empty()
            full_response = ""
            
            with st.expander("🔍 Technical Trace (RAG Pipeline Steps)", expanded=False):
                trace_placeholder = st.empty()
                trace_log = []

            response_placeholder = st.empty()
            
            try:
                # Call Node.js Backend with streaming enabled
                response = requests.post(
                    "http://localhost:3000/api/repos/chat",
                    json={"query": prompt},
                    stream=True
                )

                for line in response.iter_lines():
                    if line:
                        decoded_line = line.decode('utf-8')
                        if decoded_line.startswith("data: "):
                            data_content = decoded_line[6:] # Strip 'data: '
                            
                            if data_content == "[DONE]":
                                break
                            
                            try:
                                chunk_json = json.loads(data_content)
                                
                                # Check for Technical Metadata/Logs from Backend
                                if "log" in chunk_json:
                                    trace_log.append(chunk_json["log"])
                                    trace_placeholder.markdown("\n".join([f"- {l}" for l in trace_log]))
                                
                                # Check for actual response text
                                if "text" in chunk_json:
                                    token = chunk_json.get("text", "")
                                    full_response += token
                                    response_placeholder.markdown(full_response + "▌")
                                    
                            except json.JSONDecodeError:
                                continue

                response_placeholder.markdown(full_response)
                st.session_state.messages.append({"role": "assistant", "content": full_response})
            
            except Exception as e:
                st.error(f"Error connecting to backend: {e}")