"use client";

import { useCallback, useMemo, useState } from "react";
import { DifyProxyError, difyProxyRequest } from "@/lib/dify-client";

type Panel = "knowledge" | "documents" | "apps" | "chat" | "workflow" | "explorer";

type DatasetItem = {
  id: string;
  name: string;
  indexing_technique?: string;
  document_count?: number;
  created_at?: string;
};

type DocumentItem = {
  id: string;
  name?: string;
  indexing_status?: string;
  word_count?: number;
  created_at?: string;
};

type AppItem = {
  id: string;
  name: string;
  mode?: string;
  status?: string;
  created_at?: string;
};

const PANELS: Array<{ id: Panel; label: string; subtitle: string }> = [
  { id: "knowledge", label: "Knowledge", subtitle: "Datasets + vectors" },
  { id: "documents", label: "Documents", subtitle: "Indexing controls" },
  { id: "apps", label: "Apps", subtitle: "App inventory" },
  { id: "chat", label: "Chat", subtitle: "chat-messages API" },
  { id: "workflow", label: "Workflow", subtitle: "workflows/run API" },
  { id: "explorer", label: "Explorer", subtitle: "Any Dify endpoint" },
];

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseList<T>(raw: unknown): T[] {
  if (!raw || typeof raw !== "object") return [];
  const payload = raw as Record<string, unknown>;
  if (Array.isArray(payload.data)) return payload.data as T[];
  if (Array.isArray(payload.items)) return payload.items as T[];
  return [];
}

function formatError(error: unknown): string {
  if (error instanceof DifyProxyError) {
    return `HTTP ${error.status}: ${prettyJson(error.detail)}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export default function Dashboard() {
  const [consoleToken, setConsoleToken] = useState("");
  const [appToken, setAppToken] = useState("");
  const [activePanel, setActivePanel] = useState<Panel>("knowledge");
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState("[SYS] Awaiting operator command.");

  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [newDatasetName, setNewDatasetName] = useState("");
  const [datasetFile, setDatasetFile] = useState<File | null>(null);

  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const [apps, setApps] = useState<AppItem[]>([]);

  const [chatInput, setChatInput] = useState("");
  const [chatUser, setChatUser] = useState("neon-operator");
  const [chatOutput, setChatOutput] = useState("{}");

  const [workflowUser, setWorkflowUser] = useState("neon-operator");
  const [workflowInputs, setWorkflowInputs] = useState('{"topic":"neon-nexus"}');
  const [workflowOutput, setWorkflowOutput] = useState("{}");

  const [explorerMethod, setExplorerMethod] = useState<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">("GET");
  const [explorerPath, setExplorerPath] = useState("datasets?page=1&limit=20");
  const [explorerBody, setExplorerBody] = useState('{"name":"NEXUS-CYBER-KB"}');
  const [explorerResult, setExplorerResult] = useState("{}");
  const [explorerTokenMode, setExplorerTokenMode] = useState<"console" | "app">("console");

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId),
    [datasets, selectedDatasetId]
  );

  const runSafe = useCallback(async (message: string, task: () => Promise<void>) => {
    setBusy(true);
    setStatusLine(`[SYS] ${message}`);

    try {
      await task();
      setStatusLine(`[OK] ${message}`);
    } catch (error) {
      setStatusLine(`[ERR] ${formatError(error)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const loadDatasets = useCallback(async () => {
    if (!consoleToken.trim()) {
      setStatusLine("[ERR] Missing Dify console token.");
      return;
    }

    await runSafe("Syncing datasets from Dify.", async () => {
      const response = await difyProxyRequest(consoleToken, "datasets", {
        query: { page: 1, limit: 50 },
      });

      const list = parseList<DatasetItem>(response);
      setDatasets(list);

      if (list.length > 0) {
        setSelectedDatasetId((current) => current || list[0].id);
      }
    });
  }, [consoleToken, runSafe]);

  const createDataset = useCallback(async () => {
    if (!consoleToken.trim() || !newDatasetName.trim()) {
      setStatusLine("[ERR] Dataset name or console token missing.");
      return;
    }

    await runSafe("Creating dataset and optional file ingestion.", async () => {
      const createResponse = (await difyProxyRequest(consoleToken, "datasets", {
        method: "POST",
        body: { name: newDatasetName.trim() },
      })) as { id?: string };

      const datasetId = createResponse.id;
      if (!datasetId) {
        throw new Error("Dify returned no dataset ID.");
      }

      if (datasetFile) {
        const upload = new FormData();
        upload.append("file", datasetFile);
        upload.append(
          "data",
          JSON.stringify({
            indexing_technique: "high_quality",
            process_rule: { mode: "automatic", rules: {} },
          })
        );

        await difyProxyRequest(consoleToken, `datasets/${datasetId}/document/create_by_file`, {
          method: "POST",
          body: upload,
        });
      }

      setNewDatasetName("");
      setDatasetFile(null);
      await loadDatasets();
    });
  }, [consoleToken, newDatasetName, datasetFile, loadDatasets, runSafe]);

  const deleteDataset = useCallback(
    async (datasetId: string) => {
      if (!consoleToken.trim()) {
        setStatusLine("[ERR] Missing Dify console token.");
        return;
      }

      await runSafe(`Deleting dataset ${datasetId}.`, async () => {
        await difyProxyRequest(consoleToken, `datasets/${datasetId}`, { method: "DELETE" });
        setDocuments([]);
        if (datasetId === selectedDatasetId) setSelectedDatasetId("");
        await loadDatasets();
      });
    },
    [consoleToken, selectedDatasetId, loadDatasets, runSafe]
  );

  const loadDocuments = useCallback(async () => {
    if (!consoleToken.trim() || !selectedDatasetId) {
      setStatusLine("[ERR] Select dataset and provide console token.");
      return;
    }

    await runSafe(`Loading documents for dataset ${selectedDatasetId}.`, async () => {
      const response = await difyProxyRequest(consoleToken, `datasets/${selectedDatasetId}/documents`, {
        query: { page: 1, limit: 50 },
      });

      setDocuments(parseList<DocumentItem>(response));
    });
  }, [consoleToken, selectedDatasetId, runSafe]);

  const uploadDocument = useCallback(async () => {
    if (!consoleToken.trim() || !selectedDatasetId || !documentFile) {
      setStatusLine("[ERR] Missing dataset selection, file, or token.");
      return;
    }

    await runSafe(`Uploading document into ${selectedDatasetId}.`, async () => {
      const form = new FormData();
      form.append("file", documentFile);
      form.append(
        "data",
        JSON.stringify({
          indexing_technique: "high_quality",
          process_rule: { mode: "automatic", rules: {} },
        })
      );

      await difyProxyRequest(consoleToken, `datasets/${selectedDatasetId}/document/create_by_file`, {
        method: "POST",
        body: form,
      });

      setDocumentFile(null);
      await loadDocuments();
    });
  }, [consoleToken, selectedDatasetId, documentFile, loadDocuments, runSafe]);

  const deleteDocument = useCallback(
    async (documentId: string) => {
      if (!consoleToken.trim() || !selectedDatasetId) {
        setStatusLine("[ERR] Missing dataset selection or token.");
        return;
      }

      await runSafe(`Deleting document ${documentId}.`, async () => {
        await difyProxyRequest(consoleToken, `datasets/${selectedDatasetId}/documents/${documentId}`, {
          method: "DELETE",
        });
        await loadDocuments();
      });
    },
    [consoleToken, selectedDatasetId, loadDocuments, runSafe]
  );

  const loadApps = useCallback(async () => {
    if (!consoleToken.trim()) {
      setStatusLine("[ERR] Missing Dify console token.");
      return;
    }

    await runSafe("Syncing app inventory.", async () => {
      const response = await difyProxyRequest(consoleToken, "apps", { query: { page: 1, limit: 50 } });
      setApps(parseList<AppItem>(response));
    });
  }, [consoleToken, runSafe]);

  const sendChatMessage = useCallback(async () => {
    const token = (appToken.trim() || consoleToken.trim()).trim();
    if (!token || !chatInput.trim()) {
      setStatusLine("[ERR] Missing chat token or prompt.");
      return;
    }

    await runSafe("Dispatching chat-messages request.", async () => {
      const response = await difyProxyRequest(token, "chat-messages", {
        method: "POST",
        body: {
          query: chatInput,
          inputs: {},
          response_mode: "blocking",
          user: chatUser || "neon-operator",
        },
      });

      setChatOutput(prettyJson(response));
      setChatInput("");
    });
  }, [appToken, consoleToken, chatInput, chatUser, runSafe]);

  const runWorkflow = useCallback(async () => {
    const token = (appToken.trim() || consoleToken.trim()).trim();
    if (!token) {
      setStatusLine("[ERR] Missing workflow token.");
      return;
    }

    let inputs: Record<string, unknown> = {};
    if (workflowInputs.trim()) {
      try {
        const parsed = JSON.parse(workflowInputs);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          inputs = parsed as Record<string, unknown>;
        }
      } catch {
        throw new Error("Workflow inputs must be valid JSON object.");
      }
    }

    await runSafe("Dispatching workflows/run request.", async () => {
      const response = await difyProxyRequest(token, "workflows/run", {
        method: "POST",
        body: {
          inputs,
          response_mode: "blocking",
          user: workflowUser || "neon-operator",
        },
      });

      setWorkflowOutput(prettyJson(response));
    });
  }, [appToken, consoleToken, workflowInputs, workflowUser, runSafe]);

  const runExplorer = useCallback(async () => {
    const token = explorerTokenMode === "app" ? (appToken.trim() || consoleToken.trim()) : consoleToken.trim();
    if (!token) {
      setStatusLine("[ERR] Missing token for endpoint explorer.");
      return;
    }

    const normalized = explorerPath.trim().replace(/^\/+/, "");
    if (!normalized) {
      setStatusLine("[ERR] Explorer path is required.");
      return;
    }

    let body: unknown;
    if (explorerMethod !== "GET" && explorerMethod !== "DELETE" && explorerBody.trim()) {
      try {
        body = JSON.parse(explorerBody);
      } catch {
        setStatusLine("[ERR] Explorer body must be valid JSON.");
        return;
      }
    }

    await runSafe(`Proxying ${explorerMethod} ${normalized}`, async () => {
      const response = await difyProxyRequest(token, normalized, {
        method: explorerMethod,
        body,
      });
      setExplorerResult(prettyJson(response));
    });
  }, [appToken, consoleToken, explorerTokenMode, explorerPath, explorerMethod, explorerBody, runSafe]);

  return (
    <div className="dashboard-shell">
      <div className="scanline" />
      <header className="topbar">
        <div>
          <p className="micro-label">NEON//NEXUS</p>
          <h1 className="title">DIFY COMMAND DECK</h1>
          <p className="subtitle">Cyberpunk 2077 styled control surface for Dify backend operations.</p>
        </div>
        <div className="status-box">
          <span className="status-dot" />
          <span>{busy ? "RUNNING" : "IDLE"}</span>
        </div>
      </header>

      <main className="dashboard-grid">
        <aside className="left-rail">
          <section className="card">
            <p className="card-label">Control Plane Token</p>
            <input
              type="password"
              value={consoleToken}
              onChange={(event) => setConsoleToken(event.target.value)}
              placeholder="Bearer token for /v1 datasets + management"
              className="neon-input"
            />
            <p className="card-label mt-4">App Runtime Token</p>
            <input
              type="password"
              value={appToken}
              onChange={(event) => setAppToken(event.target.value)}
              placeholder="Optional app token for chat/workflow"
              className="neon-input"
            />
          </section>

          <section className="card">
            <p className="card-label">Systems</p>
            <div className="rail-list">
              {PANELS.map((panel) => (
                <button
                  key={panel.id}
                  onClick={() => setActivePanel(panel.id)}
                  className={`rail-item ${activePanel === panel.id ? "active" : ""}`}
                >
                  <span>{panel.label}</span>
                  <small>{panel.subtitle}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="card">
            <p className="card-label">System Feed</p>
            <pre className="terminal-feed">{statusLine}</pre>
          </section>
        </aside>

        <section className="main-panel">
          {activePanel === "knowledge" && (
            <div className="card panel">
              <div className="panel-head">
                <h2>Knowledge Bases</h2>
                <button className="neon-btn" onClick={loadDatasets} disabled={busy}>
                  Refresh
                </button>
              </div>

              <div className="panel-grid">
                <input
                  className="neon-input"
                  placeholder="Dataset name"
                  value={newDatasetName}
                  onChange={(event) => setNewDatasetName(event.target.value)}
                />
                <input
                  className="neon-input"
                  type="file"
                  onChange={(event) => setDatasetFile(event.target.files?.[0] ?? null)}
                />
                <button className="neon-btn neon-btn--pink" onClick={createDataset} disabled={busy}>
                  Create / Upload
                </button>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Technique</th>
                      <th>Docs</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {datasets.length === 0 && (
                      <tr>
                        <td colSpan={4} className="empty-row">
                          No datasets loaded.
                        </td>
                      </tr>
                    )}
                    {datasets.map((dataset) => (
                      <tr key={dataset.id}>
                        <td>{dataset.name}</td>
                        <td>{dataset.indexing_technique ?? "-"}</td>
                        <td>{dataset.document_count ?? 0}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              onClick={() => {
                                setSelectedDatasetId(dataset.id);
                                setActivePanel("documents");
                              }}
                            >
                              Docs
                            </button>
                            <button onClick={() => deleteDataset(dataset.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activePanel === "documents" && (
            <div className="card panel">
              <div className="panel-head">
                <h2>Documents</h2>
                <button className="neon-btn" onClick={loadDocuments} disabled={busy}>
                  Refresh
                </button>
              </div>

              <div className="panel-grid panel-grid--docs">
                <select
                  className="neon-input"
                  value={selectedDatasetId}
                  onChange={(event) => setSelectedDatasetId(event.target.value)}
                >
                  <option value="">Select dataset</option>
                  {datasets.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.name}
                    </option>
                  ))}
                </select>
                <input
                  className="neon-input"
                  type="file"
                  onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                />
                <button className="neon-btn neon-btn--pink" onClick={uploadDocument} disabled={busy}>
                  Upload Document
                </button>
              </div>

              <p className="caption">Selected dataset: {selectedDataset?.name ?? "none"}</p>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Words</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {documents.length === 0 && (
                      <tr>
                        <td colSpan={4} className="empty-row">
                          No documents loaded.
                        </td>
                      </tr>
                    )}
                    {documents.map((document) => (
                      <tr key={document.id}>
                        <td>{document.name ?? document.id}</td>
                        <td>{document.indexing_status ?? "-"}</td>
                        <td>{document.word_count ?? 0}</td>
                        <td>
                          <button className="flat-btn" onClick={() => deleteDocument(document.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activePanel === "apps" && (
            <div className="card panel">
              <div className="panel-head">
                <h2>App Inventory</h2>
                <button className="neon-btn" onClick={loadApps} disabled={busy}>
                  Refresh
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Mode</th>
                      <th>Status</th>
                      <th>ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apps.length === 0 && (
                      <tr>
                        <td colSpan={4} className="empty-row">
                          No apps loaded.
                        </td>
                      </tr>
                    )}
                    {apps.map((app) => (
                      <tr key={app.id}>
                        <td>{app.name}</td>
                        <td>{app.mode ?? "-"}</td>
                        <td>{app.status ?? "-"}</td>
                        <td>{app.id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activePanel === "chat" && (
            <div className="card panel">
              <div className="panel-head">
                <h2>Chat Connector</h2>
                <button className="neon-btn neon-btn--pink" onClick={sendChatMessage} disabled={busy}>
                  Send
                </button>
              </div>
              <div className="panel-grid">
                <input
                  className="neon-input"
                  value={chatUser}
                  onChange={(event) => setChatUser(event.target.value)}
                  placeholder="user id"
                />
                <input
                  className="neon-input"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="chat prompt"
                />
              </div>
              <textarea className="terminal-out" value={chatOutput} readOnly />
            </div>
          )}

          {activePanel === "workflow" && (
            <div className="card panel">
              <div className="panel-head">
                <h2>Workflow Runner</h2>
                <button className="neon-btn neon-btn--pink" onClick={runWorkflow} disabled={busy}>
                  Run
                </button>
              </div>
              <div className="panel-grid">
                <input
                  className="neon-input"
                  value={workflowUser}
                  onChange={(event) => setWorkflowUser(event.target.value)}
                  placeholder="user id"
                />
              </div>
              <textarea
                className="terminal-out"
                value={workflowInputs}
                onChange={(event) => setWorkflowInputs(event.target.value)}
              />
              <textarea className="terminal-out mt-2" value={workflowOutput} readOnly />
            </div>
          )}

          {activePanel === "explorer" && (
            <div className="card panel">
              <div className="panel-head">
                <h2>Endpoint Explorer</h2>
                <button className="neon-btn neon-btn--pink" onClick={runExplorer} disabled={busy}>
                  Execute
                </button>
              </div>
              <div className="panel-grid panel-grid--explorer">
                <select
                  className="neon-input"
                  value={explorerMethod}
                  onChange={(event) =>
                    setExplorerMethod(event.target.value as "GET" | "POST" | "PUT" | "PATCH" | "DELETE")
                  }
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
                <select
                  className="neon-input"
                  value={explorerTokenMode}
                  onChange={(event) => setExplorerTokenMode(event.target.value as "console" | "app")}
                >
                  <option value="console">Console Token</option>
                  <option value="app">App Token</option>
                </select>
                <input
                  className="neon-input"
                  value={explorerPath}
                  onChange={(event) => setExplorerPath(event.target.value)}
                  placeholder="datasets?page=1&limit=20"
                />
              </div>
              <textarea
                className="terminal-out"
                value={explorerBody}
                onChange={(event) => setExplorerBody(event.target.value)}
              />
              <textarea className="terminal-out mt-2" value={explorerResult} readOnly />
              <div className="quick-links">
                <button onClick={() => setExplorerPath("datasets?page=1&limit=20")}>GET datasets</button>
                <button onClick={() => setExplorerPath("apps?page=1&limit=20")}>GET apps</button>
                <button onClick={() => setExplorerPath("chat-messages")}>POST chat-messages</button>
                <button onClick={() => setExplorerPath("workflows/run")}>POST workflows/run</button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
