import streamlit as st
import requests
import json
import re

# Page Config
st.set_page_config(page_title="GitChatBot AI", page_icon="🤖")
st.title("🚀 GitChatBot: Repo Intelligence")

# --- Helper Functions ---
def parse_github_url(url):
    """Parses GitHub URL to extract owner and repo name."""
    pattern = r"github\.com/([^/]+)/([^/]+)"
    match = re.search(pattern, url)
    if match:
        owner, repo = match.groups()
        # Clean up in case of .git suffix
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
                        json={"owner": owner, "repo": repo}
                    )
                    if res.status_code == 200:
                        st.success("✅ Repository Indexed!")
                        st.session_state['ingested'] = True
                        st.session_state['repo_name'] = f"{owner}/{repo}"
                    else:
                        st.error(f"Failed: {res.text}")
                except Exception as e:
                    st.error(f"Connection Error: {e}")
        else:
            st.warning("Please enter a valid GitHub URL.")

# --- Main Chat Interface ---
if "messages" not in st.session_state:
    st.session_state.messages = []

# Display chat history
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# Chat Input
if prompt := st.chat_input("Ask anything about the codebase..."):
    if not st.session_state.get('ingested'):
        st.warning("Please ingest a repository in the sidebar first!")
    else:
        # Add user message to UI
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)

        # Handle Streaming Response
        with st.chat_message("assistant"):
            response_placeholder = st.empty()
            full_response = ""
            
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
                                token = chunk_json.get("text", "")
                                full_response += token
                                response_placeholder.markdown(full_response + "▌")
                            except json.JSONDecodeError:
                                continue

                response_placeholder.markdown(full_response)
                st.session_state.messages.append({"role": "assistant", "content": full_response})
            
            except Exception as e:
                st.error(f"Error connecting to backend: {e}")