import os
import asyncio
from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager
from mcp import ClientSession
from mcp.client.sse import sse_client
from pydantic import BaseModel

# K8s Service URLs injected via Environment Variables
RAG_URL = os.getenv("MCP_SSE_RAG_URL", "http://neon-nexus-rag-memory.default.svc.cluster.local:8000/sse")
VISION_URL = os.getenv("MCP_SSE_VISION_URL", "http://neon-nexus-vision.default.svc.cluster.local:8000/sse")
AUDIO_URL = os.getenv("MCP_SSE_AUDIO_URL", "http://neon-nexus-audio.default.svc.cluster.local:8000/sse")

# Global variables for MCP client connections
mcp_sessions = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager to connect to MCP SSE servers on startup.
    This demonstrates Host Integration in a K8s microservice context.
    """
    try:
        print(f"Connecting to RAG MCP server at {RAG_URL}...")
        # Start SSE client context
        rag_sse = sse_client(url=RAG_URL)
        rag_streams = await rag_sse.__aenter__()
        
        # Initialize Client Session
        rag_session = ClientSession(rag_streams[0], rag_streams[1])
        await rag_session.initialize()
        
        mcp_sessions['rag'] = {
            'ctx': rag_sse,
            'session': rag_session
        }
        print("Connected to RAG MCP server.")
    except Exception as e:
        print(f"Warning: RAG server connection failed: {e}")

    # Similar blocks would connect to VISION_URL and AUDIO_URL ...
    
    yield
    
    # Cleanup on shutdown
    for key, connection in mcp_sessions.items():
        try:
            # End the SSE context
            await connection['ctx'].__aexit__(None, None, None)
        except Exception:
            pass

app = FastAPI(title="The Neon Nexus - MCP Gateway", lifespan=lifespan)

class ChatRequest(BaseModel):
    prompt: str

@app.post("/api/chat")
async def chat_interaction(request: ChatRequest):
    """
    Central router and tool negotiation endpoint.
    Retrieves the user's prompt, decides which tool to call, delegates via MCP, 
    and returns the structured LLM response.
    """
    prompt_lower = request.prompt.lower()
    
    # Simple heuristic to demonstrate tool delegation
    if "search" in prompt_lower or "knowledge base" in prompt_lower:
        if 'rag' not in mcp_sessions:
            raise HTTPException(status_code=503, detail="RAG Server is disconnected.")
            
        session = mcp_sessions['rag']['session']
        try:
            # Delegate tool call to the Python RAG FastMCP server
            result = await session.call_tool("search_documents", arguments={"query": request.prompt, "top_k": 3})
            
            content_text = ""
            for content in result.content:
                if content.type == "text":
                    content_text += content.text
                    
            return {"response": f"RAG Search Results:\n\n{content_text}"}
        except Exception as e:
            return {"error": str(e)}

    return {
        "response": "I am the core Neon Nexus LLM. How can I assist you with Vision, Audio, or knowledge retrieval today?"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
