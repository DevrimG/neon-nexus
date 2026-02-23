import os
from fastmcp import FastMCP
from qdrant_client import QdrantClient
from langchain_openai import OpenAIEmbeddings

# Initialize FastMCP Server
mcp = FastMCP("RAG Memory Server")

# Initialize Qdrant Client (URL injected via environment variable in K8s)
QDRANT_URL = os.getenv("QDRANT_URL", "http://neon-nexus-qdrant.default.svc.cluster.local:6333")
qdrant_client = QdrantClient(url=QDRANT_URL)

COLLECTION_NAME = "knowledge_base"

# Initialize Embeddings
# In a real scenario, API key would be passed from the Host or set in Env
embeddings = OpenAIEmbeddings(openai_api_key=os.getenv("OPENAI_API_KEY", "dummy-key"))

@mcp.tool()
def search_documents(query: str, top_k: int = 5) -> str:
    """
    Search the Qdrant vector database for relevant documents given a query string.
    Returns the top K matching document contents.
    """
    try:
        # Generate embedding for the query
        query_vector = embeddings.embed_query(query)
        
        # Search Qdrant
        search_result = qdrant_client.search(
            collection_name=COLLECTION_NAME,
            query_vector=query_vector,
            limit=top_k
        )
        
        # Format the results
        if not search_result:
            return "No relevant documents found."
            
        results = []
        for hit in search_result:
            content = hit.payload.get("page_content", "")
            source = hit.payload.get("source", "Unknown")
            results.append(f"Source: {source}\nContent: {content}\n---")
            
        return "\n".join(results)
    except Exception as e:
        return f"Error searching documents: {str(e)}"

if __name__ == "__main__":
    # FastMCP SSE server
    mcp.run(transport='sse', port=8000, host="0.0.0.0")
