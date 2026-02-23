import os
from fastmcp import FastMCP

mcp = FastMCP("Audio Server")

@mcp.tool()
def speech_to_text(audio_file_path: str) -> str:
    """Mock audio STT functionality."""
    return f"Transcribed text for {audio_file_path}"

if __name__ == "__main__":
    mcp.run(transport='sse', port=8000, host="0.0.0.0")
