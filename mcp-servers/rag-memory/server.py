import os
import threading
import uvicorn
from fastmcp import FastMCP
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import tempfile
from pypdf import PdfReader

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
def search_documents(query: str, collection_name: str = "knowledge_base", top_k: int = 5) -> str:
    """
    Search the Qdrant vector database for relevant documents across a specific knowledge base.
    Returns the top K matching document contents.
    """
    try:
        # Generate embedding for the query
        query_vector = embeddings.embed_query(query)
        # Check if collection exists
        if not qdrant_client.collection_exists(collection_name):
            return f"Knowledge base '{collection_name}' does not exist or has no documents."
            
        # Search Qdrant
        search_result = qdrant_client.search(
            collection_name=collection_name,
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


# ---------------------------------------------------------
# FastAPI REST API for Knowledge Base UI Management
# ---------------------------------------------------------

app = FastAPI(title="RAG Knowledge Base Management API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/knowledge-bases/upload")
async def upload_document(
    file: UploadFile = File(...),
    knowledge_name: str = Form(...),
    embedding_model: str = Form("OpenAI"),
    rerank_model: str = Form("None"),
    category: str = Form("General"),
    chunk_size: int = Form(500),
    chunk_overlap: int = Form(50)
):
    try:
        # 1. Ensure Qdrant collection exists (dimension 1536 for OpenAI)
        if not qdrant_client.collection_exists(knowledge_name):
            qdrant_client.create_collection(
                collection_name=knowledge_name,
                vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
            )
            
        # 2. Extract Text
        content = ""
        if file.filename.lower().endswith(".pdf"):
            with tempfile.NamedTemporaryFile(delete=False) as tmp:
                tmp.write(await file.read())
                tmp_path = tmp.name
            reader = PdfReader(tmp_path)
            for page in reader.pages:
                content += page.extract_text() + "\n"
            os.remove(tmp_path)
        else:
            content = (await file.read()).decode("utf-8")
            
        # 3. Chunk Text
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", " ", ""]
        )
        texts = text_splitter.split_text(content)
        
        # 4. Generate Embeddings & Store
        # Processing in batches for larger docs
        docs = [Document(page_content=t, metadata={"source": file.filename, "category": category}) for t in texts]
        
        from langchain_community.vectorstores import Qdrant
        Qdrant.from_documents(
            docs,
            embeddings,
            url=QDRANT_URL,
            collection_name=knowledge_name,
            force_recreate=False
        )
        
        return {
            "status": "success", 
            "message": f"Successfully processed {len(texts)} chunks from {file.filename} into '{knowledge_name}'"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/knowledge-bases")
async def list_knowledge_bases():
    try:
        collections = qdrant_client.get_collections().collections
        kb_list = []
        for c in collections:
            # We can retrieve total vectors to show document count proxy
            info = qdrant_client.get_collection(c.name)
            kb_list.append({
                "name": c.name,
                "vectors_count": info.points_count,
                "status": str(info.status)
            })
        return {"status": "success", "knowledge_bases": kb_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/knowledge-bases/{name}")
async def delete_knowledge_base(name: str):
    try:
        if qdrant_client.collection_exists(name):
            qdrant_client.delete_collection(name)
            return {"status": "success", "message": f"Deleted knowledge base {name}"}
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def run_fastapi():
    uvicorn.run(app, host="0.0.0.0", port=8001)

if __name__ == "__main__":
    # Start REST API in a background thread
    api_thread = threading.Thread(target=run_fastapi, daemon=True)
    api_thread.start()
    
    # Run FastMCP in main thread
    mcp.run(transport='sse', port=8000, host="0.0.0.0")
