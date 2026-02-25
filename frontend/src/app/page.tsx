"use client";

import { useState } from "react";

export default function Dashboard() {
  const [provider, setProvider] = useState("OpenAI");
  const [model, setModel] = useState("gpt-4o");
  const [apiKey, setApiKey] = useState("");
  const [difyApiKey, setDifyApiKey] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<{ role: string, content: string }[]>([]);
  const [file, setFile] = useState<File | null>(null);

  // RAG Knowledge Base State
  const [showRAGManager, setShowRAGManager] = useState(false);
  const [kbName, setKbName] = useState("");
  const [kbEmbeddingModel, setKbEmbeddingModel] = useState("");
  const [kbRerankModel, setKbRerankModel] = useState("");
  const [kbCategory, setKbCategory] = useState("General");
  const [kbChunkSize, setKbChunkSize] = useState(500);
  const [kbChunkOverlap, setKbChunkOverlap] = useState(50);
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const PROVIDERS = ["OpenAI", "OpenRouter", "Claude", "Gemini", "Kimi Moonshot"];
  const MODELS: Record<string, string[]> = {
    "OpenAI": ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
    "OpenRouter": ["anthropic/claude-3-opus", "google/gemini-pro", "meta-llama/llama-3-70b-instruct"],
    "Claude": ["claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"],
    "Gemini": ["gemini-1.5-pro", "gemini-1.5-flash"],
    "Kimi Moonshot": ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"]
  };

  const fetchKnowledgeBases = async () => {
    if (!difyApiKey) return;
    try {
      const res = await fetch('/api/knowledge-bases', {
        headers: { 'Authorization': `Bearer ${difyApiKey}` }
      });
      const data = await res.json();
      if (data.status === 'success') {
        setKnowledgeBases(data.knowledge_bases);
      }
    } catch (err) {
      console.error("Failed to fetch knowledge bases:", err);
    }
  };

  const handleDeleteKB = async (id: string) => {
    if (!difyApiKey) return;
    try {
      await fetch(`/api/knowledge-bases/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${difyApiKey}` }
      });
      fetchKnowledgeBases();
    } catch (err) {
      console.error("Failed to delete KB:", err);
    }
  };

  const handleKBSubmit = async () => {
    if (!file || !kbName || !difyApiKey) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("knowledge_name", kbName);

    try {
      await fetch('/api/knowledge-bases/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${difyApiKey}` },
        body: formData,
      });
      setFile(null);
      setKbName("");
      fetchKnowledgeBases();
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleChat = async () => {
    if (!chatInput) return;
    setChatLog(prev => [...prev, { role: "ROOT", content: chatInput }]);

    // Simulate MCP Gateway interaction mapping
    setChatLog(prev => [...prev, { role: "NEXUS", content: "Processing request through MCP Gateway..." }]);

    setTimeout(() => {
      setChatLog(prev => [
        ...prev.slice(0, -1),
        { role: "NEXUS", content: "ACK. Data received. How else may I assist you?" }
      ]);
    }, 1500);
    setChatInput("");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto flex flex-col gap-6 font-mono selection:bg-neon-red selection:text-white">

      {/* Header */}
      <header className="border-b-2 border-neon-green pb-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shadow-[0_4px_15px_-3px_rgba(0,255,65,0.2)]">
        <div>
          <h1 className="text-5xl font-bold tracking-tighter text-neon-red drop-shadow-[0_0_8px_rgba(255,0,60,0.8)]" style={{ textShadow: "0 0 8px rgba(255,0,60,0.8)" }}>
            NEON//NEXUS
          </h1>
          <p className="text-sm text-neon-green mt-1 tracking-widest uppercase">:: AI Control Center _v1.0.0</p>
        </div>

        <div className="flex flex-col items-start md:items-end gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neon-green tracking-wider uppercase border border-dim-gray px-1.5 py-1 bg-deep-black mt-1">DIFY_API_KEY:</span>
            <input
              type="password"
              placeholder="[ DATASET API KEY ]"
              value={difyApiKey}
              onChange={(e) => setDifyApiKey(e.target.value)}
              className="bg-deep-black border border-neon-red text-neon-red px-3 py-1 text-sm focus:outline-none focus:shadow-[0_0_12px_rgba(255,0,60,0.6)] placeholder-red-900 transition-shadow w-48 mt-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setModel(MODELS[e.target.value][0]);
              }}
              className="text-xs text-neon-green bg-deep-black border border-dim-gray uppercase tracking-wider focus:outline-none focus:border-neon-green p-1 cursor-pointer h-7"
            >
              {PROVIDERS.map(p => <option key={p} value={p}>{p.toUpperCase()}_API</option>)}
            </select>
            <input
              type="password"
              placeholder="[ ROUTER KEY ]"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="bg-deep-black border border-neon-red text-neon-red px-3 py-1 text-sm focus:outline-none focus:shadow-[0_0_12px_rgba(255,0,60,0.6)] placeholder-red-900 transition-shadow w-48"
            />
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow">

        {/* Left Column: AI Modules & Data Vault */}
        <div className="flex flex-col gap-6 lg:col-span-1">

          {/* Modules List */}
          <section className="border border-dim-gray bg-[#0a0a0a] p-4 relative overflow-hidden group hover:border-neon-green transition-colors">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-red to-transparent opacity-50"></div>
            <h2 className="text-xl text-neon-red mb-4 uppercase tracking-widest border-b border-dim-gray pb-2 flex items-center justify-between">
              <span>Active Modules</span>
              <span className="text-xs text-neon-green animate-pulse">● ONLINE</span>
            </h2>
            <ul className="space-y-3">
              <li className="flex justify-between items-center text-sm">
                <span className="text-gray-300">MCP::Vision</span>
                <span className="text-neon-green bg-neon-green/10 px-2 py-0.5 rounded text-xs border border-neon-green/30">READY</span>
              </li>
              <li className="flex justify-between items-center text-sm">
                <span className="text-gray-300">MCP::Audio</span>
                <span className="text-neon-green bg-neon-green/10 px-2 py-0.5 rounded text-xs border border-neon-green/30">READY</span>
              </li>
              <li
                className={`flex justify-between items-center text-sm cursor-pointer p-1 -mx-1 rounded transition-colors ${showRAGManager ? 'bg-dim-gray/30 border border-dim-gray' : 'hover:bg-dim-gray/20'}`}
                onClick={() => {
                  setShowRAGManager(!showRAGManager);
                  if (!showRAGManager) fetchKnowledgeBases();
                }}
              >
                <span className={`${showRAGManager ? 'text-neon-red font-bold' : 'text-gray-300'}`}>MCP::RAG_Memory {showRAGManager && " (MGMT)"}</span>
                <span className="text-neon-green bg-neon-green/10 px-2 py-0.5 rounded text-xs border border-neon-green/30">READY</span>
              </li>
            </ul>
          </section>

          {/* Data Vault */}
          <section className="border border-dim-gray bg-[#0a0a0a] p-4 relative hover:border-neon-green transition-colors flex-grow flex flex-col">
            <h2 className="text-xl text-neon-green mb-4 uppercase tracking-widest border-b border-dim-gray pb-2">
              Data Vault [RAG]
            </h2>

            {showRAGManager ? (
              <div className="flex flex-col gap-3 flex-grow overflow-auto">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <input type="text" placeholder="KNOWLEDGE NAME" value={kbName} onChange={e => setKbName(e.target.value)} className="bg-deep-black border border-dim-gray p-2 text-neon-green focus:border-neon-green outline-none uppercase" />
                  <input type="text" placeholder="CATEGORY" value={kbCategory} onChange={e => setKbCategory(e.target.value)} className="bg-deep-black border border-dim-gray p-2 text-neon-green focus:border-neon-green outline-none uppercase" />

                  <input type="text" placeholder="EMBEDDING MODEL" value={kbEmbeddingModel} onChange={e => setKbEmbeddingModel(e.target.value)} className="bg-deep-black border border-dim-gray p-2 text-neon-green focus:border-neon-green outline-none uppercase" />

                  <input type="text" placeholder="RERANKER MODEL (Optional)" value={kbRerankModel} onChange={e => setKbRerankModel(e.target.value)} className="bg-deep-black border border-dim-gray p-2 text-neon-green focus:border-neon-green outline-none uppercase" />

                  <div className="flex items-center gap-2 border border-dim-gray p-2 pl-3 bg-deep-black">
                    <span className="text-gray-500 w-16">CHUNK:</span>
                    <input type="number" value={kbChunkSize} onChange={e => setKbChunkSize(Number(e.target.value))} className="bg-transparent text-neon-green outline-none w-16" />
                  </div>

                  <div className="flex items-center gap-2 border border-dim-gray p-2 pl-3 bg-deep-black">
                    <span className="text-gray-500 w-16">OVERLAP:</span>
                    <input type="number" value={kbChunkOverlap} onChange={e => setKbChunkOverlap(Number(e.target.value))} className="bg-transparent text-neon-green outline-none w-16" />
                  </div>
                </div>

                <div className="border-2 border-dashed border-dim-gray hover:border-neon-red transition-colors flex flex-col items-center justify-center p-4 bg-deep-black cursor-pointer group relative my-2">
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} />
                  <span className="text-xs text-gray-400 group-hover:text-neon-red transition-colors text-center uppercase">
                    {file ? file.name : "SELECT OR DROP PDF/TXT FILE"}
                  </span>
                </div>

                {(file && kbName) && (
                  <button onClick={handleKBSubmit} disabled={isUploading} className="w-full bg-neon-red text-deep-black font-bold py-2 hover:bg-[#ff3366] transition-colors uppercase text-sm shadow-[0_0_10px_rgba(255,0,60,0.3)] disabled:opacity-50">
                    {isUploading ? "PROCESSING DATA VECTORIZATION..." : "INITIALIZE EMBEDDING PIPELINE"}
                  </button>
                )}
              </div>
            ) : (
              // Minimal vault view when closed
              <>
                <p className="text-xs text-gray-500 mb-4">Click MCP::RAG_Memory above to manage Knowledge Bases.</p>
                <div className="border border-dim-gray bg-deep-black flex-grow p-4 animate-pulse flex items-center justify-center opacity-30">
                  <span className="text-neon-green text-xs font-mono tracking-widest">[ STANDBY ]</span>
                </div>
              </>
            )}
          </section>
        </div>

        {/* Right Column: Terminal Chat */}
        <section className="border border-dim-gray hover:border-neon-green bg-[#0a0a0a] p-4 flex flex-col lg:col-span-2 relative transition-colors shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
          <h2 className="text-xl text-neon-green mb-4 uppercase tracking-widest border-b border-dim-gray pb-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span>Terminal</span>
              <span className="text-xs border border-dim-gray text-gray-400 px-2 py-0.5 rounded bg-deep-black">COM_LINK</span>
            </div>
            {!showRAGManager && (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="text-xs bg-deep-black text-neon-green border border-neon-green/50 p-1 focus:outline-none focus:border-neon-green cursor-pointer"
              >
                {MODELS[provider]?.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
          </h2>

          <div className={`flex-grow overflow-auto mb-4 p-4 border border-dim-gray ${showRAGManager ? 'bg-[#111]' : 'bg-deep-black'} font-mono text-sm leading-relaxed min-h-[400px]`}>
            {showRAGManager ? (
              // Matrix/Dify Style KB Table Viewer embedded in the Terminal window
              <div>
                <div className="text-neon-green mb-4 border-b border-dim-gray pb-2 flex justify-between items-end">
                  <span>[SYSTEM] Knowledge Base Inventory Activated</span>
                  <button onClick={fetchKnowledgeBases} className="text-xs text-gray-400 hover:text-white border-b border-transparent hover:border-white uppercase tracking-wider">REFRESH</button>
                </div>

                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-neon-red/50 text-neon-red">
                      <th className="p-2 font-normal uppercase tracking-wider">Base Name</th>
                      <th className="p-2 font-normal uppercase tracking-wider">Qdrant Vectors</th>
                      <th className="p-2 font-normal uppercase tracking-wider">Status</th>
                      <th className="p-2 font-normal uppercase tracking-wider text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {knowledgeBases.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-gray-600 border-b border-dim-gray">NO ACTIVE KNOWLEDGE BASES INITIALIZED</td>
                      </tr>
                    ) : (
                      knowledgeBases.map((kb) => (
                        <tr key={kb.name} className="border-b border-dim-gray hover:bg-dim-gray/20 transition-colors">
                          <td className="p-2 text-neon-green">{kb.name}</td>
                          <td className="p-2 text-gray-400">{kb.vectors_count} Chunks</td>
                          <td className="p-2 text-gray-400">{kb.status}</td>
                          <td className="p-2 text-right">
                            <button
                              onClick={() => handleDeleteKB(kb.id)}
                              className="text-red-900 hover:text-neon-red transition-colors border border-transparent hover:border-neon-red px-2 py-1 rounded"
                            >
                              PURGE
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              // Original Chat Log
              <>
                <div className="text-gray-500 mb-4">
                  [SYSTEM] Establishing secure connection to Neon Nexus Gateway...<br />
                  [SYSTEM] MCP Host connected.<br />
                  [SYSTEM] Awaiting input.<br />
                  =============================================
                </div>
                {chatLog.map((log, index) => (
                  <div key={index} className="mb-3">
                    <span className={log.role === 'ROOT' ? 'text-neon-red' : 'text-neon-green'}>
                      {log.role}@NEXUS:~${" "}
                    </span>
                    <span className="text-gray-300 whitespace-pre-wrap">{log.content}</span>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="flex gap-2 relative group">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neon-red font-bold">
              &gt;
            </span>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChat()}
              placeholder="Execute command..."
              className="w-full bg-[#111] border border-neon-red text-neon-green pl-10 pr-4 py-4 input-glow focus:outline-none focus:border-neon-green transition-all font-mono"
            />
            <button
              onClick={handleChat}
              className="bg-neon-red text-deep-black px-8 font-bold hover:bg-neon-green transition-colors uppercase shadow-[0_0_10px_rgba(255,0,60,0.4)]"
            >
              Send
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
