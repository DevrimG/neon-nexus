"use client";

import { useCallback, useMemo, useState } from "react";
import { DifyProxyError, difyProxyRequest } from "@/lib/dify-client";

type Panel = "knowledge" | "documents" | "tuning" | "apps" | "chat" | "workflow" | "explorer";
type IndexingTechnique = "high_quality" | "economy";
type DatasetPermission = "only_me" | "all_team_members" | "partial_members";
type RetrievalMethod = "semantic_search" | "full_text_search" | "hybrid_search" | "keyword_search";
type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RerankingModel = {
  reranking_provider_name?: string;
  reranking_model_name?: string;
};

type RetrievalModel = {
  search_method: RetrievalMethod;
  reranking_enable: boolean;
  reranking_mode?: string;
  reranking_model?: RerankingModel;
  top_k: number;
  score_threshold_enabled: boolean;
  score_threshold: number;
};

type TagItem = {
  id: string;
  name: string;
  binding_count?: number;
};

type DatasetItem = {
  id: string;
  name: string;
  description?: string;
  permission?: DatasetPermission;
  indexing_technique?: IndexingTechnique;
  embedding_model?: string;
  embedding_model_provider?: string;
  retrieval_model_dict?: RetrievalModel;
  document_count?: number;
  tags?: TagItem[];
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

type ProviderModelOption = {
  provider: string;
  model: string;
  label: string;
};

const DEFAULT_TOP_K = 4;
const DEFAULT_SCORE_THRESHOLD = 0.5;

const PANELS: Array<{ id: Panel; label: string; subtitle: string }> = [
  { id: "knowledge", label: "Knowledge", subtitle: "Create datasets + upload" },
  { id: "documents", label: "Documents", subtitle: "Indexing controls" },
  { id: "tuning", label: "Tuning", subtitle: "Tags + rerank + embeddings" },
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

function parseArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  return parseList<T>(raw);
}

function formatError(error: unknown): string {
  if (error instanceof DifyProxyError) {
    if (error.status === 401) {
      return "HTTP 401: invalid token for this endpoint. Use a Knowledge API (dataset scope) key.";
    }
    return `HTTP ${error.status}: ${prettyJson(error.detail)}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function normalizeRetrievalModel(raw: unknown, indexing: IndexingTechnique): RetrievalModel {
  const fallbackMethod: RetrievalMethod = indexing === "economy" ? "keyword_search" : "semantic_search";
  const fallback: RetrievalModel = {
    search_method: fallbackMethod,
    reranking_enable: false,
    reranking_mode: "reranking_model",
    top_k: DEFAULT_TOP_K,
    score_threshold_enabled: false,
    score_threshold: DEFAULT_SCORE_THRESHOLD,
  };

  if (!raw || typeof raw !== "object") return fallback;

  const value = raw as Record<string, unknown>;
  const method = value.search_method;
  const topK = value.top_k;
  const scoreThreshold = value.score_threshold;
  const reranking = value.reranking_model;

  const parsed: RetrievalModel = {
    search_method:
      method === "semantic_search" || method === "full_text_search" || method === "hybrid_search" || method === "keyword_search"
        ? method
        : fallbackMethod,
    reranking_enable: Boolean(value.reranking_enable),
    reranking_mode: typeof value.reranking_mode === "string" ? value.reranking_mode : "reranking_model",
    top_k: typeof topK === "number" && Number.isFinite(topK) ? Math.max(1, Math.floor(topK)) : DEFAULT_TOP_K,
    score_threshold_enabled: Boolean(value.score_threshold_enabled),
    score_threshold:
      typeof scoreThreshold === "number" && Number.isFinite(scoreThreshold) ? scoreThreshold : DEFAULT_SCORE_THRESHOLD,
  };

  if (reranking && typeof reranking === "object") {
    const model = reranking as Record<string, unknown>;
    const provider = typeof model.reranking_provider_name === "string" ? model.reranking_provider_name : "";
    const modelName = typeof model.reranking_model_name === "string" ? model.reranking_model_name : "";
    if (provider && modelName) {
      parsed.reranking_model = {
        reranking_provider_name: provider,
        reranking_model_name: modelName,
      };
    }
  }

  return parsed;
}

function buildRetrievalModel(payload: {
  indexing: IndexingTechnique;
  searchMethod: RetrievalMethod;
  rerankingEnabled: boolean;
  rerankingProvider: string;
  rerankingModel: string;
  topK: number;
  scoreThresholdEnabled: boolean;
  scoreThreshold: number;
}): RetrievalModel {
  const model: RetrievalModel = {
    search_method: payload.indexing === "economy" ? "keyword_search" : payload.searchMethod,
    reranking_enable: payload.indexing === "economy" ? false : payload.rerankingEnabled,
    reranking_mode: "reranking_model",
    top_k: Math.max(1, Math.floor(payload.topK)),
    score_threshold_enabled: payload.scoreThresholdEnabled,
    score_threshold: payload.scoreThreshold,
  };

  if (
    payload.indexing !== "economy" &&
    payload.rerankingEnabled &&
    payload.rerankingProvider.trim() &&
    payload.rerankingModel.trim()
  ) {
    model.reranking_model = {
      reranking_provider_name: payload.rerankingProvider.trim(),
      reranking_model_name: payload.rerankingModel.trim(),
    };
  }

  return model;
}

function parseProviderModelOptions(raw: unknown): ProviderModelOption[] {
  const rows = parseArray<Record<string, unknown>>(raw);
  const options: ProviderModelOption[] = [];

  for (const row of rows) {
    const provider = typeof row.provider === "string" ? row.provider : "";
    const providerLabel = typeof row.label === "string" ? row.label : provider;
    const models = Array.isArray(row.models) ? row.models : [];

    if (models.length > 0) {
      for (const modelCandidate of models) {
        if (!modelCandidate || typeof modelCandidate !== "object") continue;
        const modelRow = modelCandidate as Record<string, unknown>;
        const model = typeof modelRow.model === "string" ? modelRow.model : "";
        if (!provider || !model) continue;
        const label = typeof modelRow.label === "string" ? modelRow.label : model;
        options.push({ provider, model, label: `${providerLabel} / ${label}` });
      }
      continue;
    }

    const model = typeof row.model === "string" ? row.model : "";
    if (provider && model) {
      options.push({ provider, model, label: `${providerLabel} / ${model}` });
    }
  }

  const dedupe = new Map<string, ProviderModelOption>();
  for (const option of options) {
    dedupe.set(`${option.provider}::${option.model}`, option);
  }

  return Array.from(dedupe.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export default function Dashboard() {
  const [consoleToken, setConsoleToken] = useState("");
  const [appToken, setAppToken] = useState("");
  const [activePanel, setActivePanel] = useState<Panel>("knowledge");
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState("[SYS] Awaiting operator command.");

  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [newDatasetName, setNewDatasetName] = useState("");
  const [newDatasetDescription, setNewDatasetDescription] = useState("");
  const [createPermission, setCreatePermission] = useState<DatasetPermission>("only_me");
  const [createIndexing, setCreateIndexing] = useState<IndexingTechnique>("high_quality");
  const [createSearchMethod, setCreateSearchMethod] = useState<RetrievalMethod>("semantic_search");
  const [createRerankingEnabled, setCreateRerankingEnabled] = useState(false);
  const [createRerankProvider, setCreateRerankProvider] = useState("");
  const [createRerankModel, setCreateRerankModel] = useState("");
  const [createEmbeddingProvider, setCreateEmbeddingProvider] = useState("");
  const [createEmbeddingModel, setCreateEmbeddingModel] = useState("");
  const [createTopK, setCreateTopK] = useState(DEFAULT_TOP_K);
  const [createThresholdEnabled, setCreateThresholdEnabled] = useState(false);
  const [createThreshold, setCreateThreshold] = useState(DEFAULT_SCORE_THRESHOLD);
  const [datasetFile, setDatasetFile] = useState<File | null>(null);

  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const [tuningName, setTuningName] = useState("");
  const [tuningDescription, setTuningDescription] = useState("");
  const [tuningPermission, setTuningPermission] = useState<DatasetPermission>("only_me");
  const [tuningIndexing, setTuningIndexing] = useState<IndexingTechnique>("high_quality");
  const [tuningSearchMethod, setTuningSearchMethod] = useState<RetrievalMethod>("semantic_search");
  const [tuningRerankingEnabled, setTuningRerankingEnabled] = useState(false);
  const [tuningRerankProvider, setTuningRerankProvider] = useState("");
  const [tuningRerankModel, setTuningRerankModel] = useState("");
  const [tuningEmbeddingProvider, setTuningEmbeddingProvider] = useState("");
  const [tuningEmbeddingModel, setTuningEmbeddingModel] = useState("");
  const [tuningTopK, setTuningTopK] = useState(DEFAULT_TOP_K);
  const [tuningThresholdEnabled, setTuningThresholdEnabled] = useState(false);
  const [tuningThreshold, setTuningThreshold] = useState(DEFAULT_SCORE_THRESHOLD);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");

  const [embeddingOptions, setEmbeddingOptions] = useState<ProviderModelOption[]>([]);
  const [rerankOptions, setRerankOptions] = useState<ProviderModelOption[]>([]);

  const [apps, setApps] = useState<AppItem[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatUser, setChatUser] = useState("neon-operator");
  const [chatOutput, setChatOutput] = useState("{}");
  const [workflowUser, setWorkflowUser] = useState("neon-operator");
  const [workflowInputs, setWorkflowInputs] = useState('{"topic":"neon-nexus"}');
  const [workflowOutput, setWorkflowOutput] = useState("{}");
  const [explorerMethod, setExplorerMethod] = useState<RequestMethod>("GET");
  const [explorerPath, setExplorerPath] = useState("datasets?page=1&limit=20");
  const [explorerBody, setExplorerBody] = useState('{"name":"NEXUS-CYBER-KB"}');
  const [explorerResult, setExplorerResult] = useState("{}");
  const [explorerTokenMode, setExplorerTokenMode] = useState<"console" | "app">("console");

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId),
    [datasets, selectedDatasetId]
  );

  const embeddingProviders = useMemo(
    () => Array.from(new Set(embeddingOptions.map((item) => item.provider))).sort(),
    [embeddingOptions]
  );
  const rerankProviders = useMemo(
    () => Array.from(new Set(rerankOptions.map((item) => item.provider))).sort(),
    [rerankOptions]
  );

  const createEmbeddingModels = useMemo(
    () =>
      embeddingOptions
        .filter((item) => !createEmbeddingProvider || item.provider === createEmbeddingProvider)
        .map((item) => item.model),
    [embeddingOptions, createEmbeddingProvider]
  );
  const tuningEmbeddingModels = useMemo(
    () =>
      embeddingOptions
        .filter((item) => !tuningEmbeddingProvider || item.provider === tuningEmbeddingProvider)
        .map((item) => item.model),
    [embeddingOptions, tuningEmbeddingProvider]
  );
  const createRerankModels = useMemo(
    () =>
      rerankOptions
        .filter((item) => !createRerankProvider || item.provider === createRerankProvider)
        .map((item) => item.model),
    [rerankOptions, createRerankProvider]
  );
  const tuningRerankModels = useMemo(
    () =>
      rerankOptions
        .filter((item) => !tuningRerankProvider || item.provider === tuningRerankProvider)
        .map((item) => item.model),
    [rerankOptions, tuningRerankProvider]
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
      setStatusLine("[ERR] Missing Dify dataset token.");
      return;
    }

    await runSafe("Syncing datasets from Dify.", async () => {
      const response = await difyProxyRequest(consoleToken, "datasets", {
        query: { page: 1, limit: 100 },
      });
      const list = parseArray<DatasetItem>(response);
      setDatasets(list);
      if (list.length > 0) {
        setSelectedDatasetId((current) => current || list[0].id);
      } else {
        setSelectedDatasetId("");
      }
    });
  }, [consoleToken, runSafe]);

  const loadDocuments = useCallback(async () => {
    if (!consoleToken.trim() || !selectedDatasetId) {
      setStatusLine("[ERR] Select dataset and provide dataset token.");
      return;
    }

    await runSafe(`Loading documents for dataset ${selectedDatasetId}.`, async () => {
      const response = await difyProxyRequest(consoleToken, `datasets/${selectedDatasetId}/documents`, {
        query: { page: 1, limit: 100 },
      });
      setDocuments(parseArray<DocumentItem>(response));
    });
  }, [consoleToken, selectedDatasetId, runSafe]);

  const loadModelCatalog = useCallback(async () => {
    if (!consoleToken.trim()) {
      setStatusLine("[ERR] Missing Dify dataset token.");
      return;
    }

    await runSafe("Loading embedding and rerank model catalogs.", async () => {
      const [embeddingRaw, rerankRaw] = await Promise.all([
        difyProxyRequest(consoleToken, "workspaces/current/models/model-types/text-embedding"),
        difyProxyRequest(consoleToken, "workspaces/current/models/model-types/rerank"),
      ]);

      const embeddingParsed = parseProviderModelOptions(embeddingRaw);
      const rerankParsed = parseProviderModelOptions(rerankRaw);
      setEmbeddingOptions(embeddingParsed);
      setRerankOptions(rerankParsed);

      if (!createEmbeddingProvider && embeddingParsed[0]) {
        setCreateEmbeddingProvider(embeddingParsed[0].provider);
      }
      if (!createEmbeddingModel && embeddingParsed[0]) {
        setCreateEmbeddingModel(embeddingParsed[0].model);
      }
      if (!tuningEmbeddingProvider && embeddingParsed[0]) {
        setTuningEmbeddingProvider(embeddingParsed[0].provider);
      }
      if (!tuningEmbeddingModel && embeddingParsed[0]) {
        setTuningEmbeddingModel(embeddingParsed[0].model);
      }
      if (!createRerankProvider && rerankParsed[0]) {
        setCreateRerankProvider(rerankParsed[0].provider);
      }
      if (!createRerankModel && rerankParsed[0]) {
        setCreateRerankModel(rerankParsed[0].model);
      }
      if (!tuningRerankProvider && rerankParsed[0]) {
        setTuningRerankProvider(rerankParsed[0].provider);
      }
      if (!tuningRerankModel && rerankParsed[0]) {
        setTuningRerankModel(rerankParsed[0].model);
      }
    });
  }, [
    consoleToken,
    createEmbeddingModel,
    createEmbeddingProvider,
    createRerankModel,
    createRerankProvider,
    tuningEmbeddingModel,
    tuningEmbeddingProvider,
    tuningRerankModel,
    tuningRerankProvider,
    runSafe,
  ]);

  const loadTags = useCallback(async () => {
    if (!consoleToken.trim()) {
      setStatusLine("[ERR] Missing Dify dataset token.");
      return;
    }

    await runSafe("Loading knowledge tags.", async () => {
      const response = await difyProxyRequest(consoleToken, "datasets/tags");
      setTags(parseArray<TagItem>(response));
    });
  }, [consoleToken, runSafe]);

  const syncControlPlane = useCallback(async () => {
    if (!consoleToken.trim()) {
      setStatusLine("[ERR] Missing Dify dataset token.");
      return;
    }

    await runSafe("Syncing datasets, tags, and model catalogs.", async () => {
      const [datasetsRaw, tagsRaw, embeddingRaw, rerankRaw] = await Promise.all([
        difyProxyRequest(consoleToken, "datasets", { query: { page: 1, limit: 100 } }),
        difyProxyRequest(consoleToken, "datasets/tags"),
        difyProxyRequest(consoleToken, "workspaces/current/models/model-types/text-embedding"),
        difyProxyRequest(consoleToken, "workspaces/current/models/model-types/rerank"),
      ]);

      const datasetList = parseArray<DatasetItem>(datasetsRaw);
      setDatasets(datasetList);
      setTags(parseArray<TagItem>(tagsRaw));
      setEmbeddingOptions(parseProviderModelOptions(embeddingRaw));
      setRerankOptions(parseProviderModelOptions(rerankRaw));

      if (datasetList.length > 0) {
        setSelectedDatasetId((current) => current || datasetList[0].id);
      } else {
        setSelectedDatasetId("");
      }
    });
  }, [consoleToken, runSafe]);

  const loadSelectedDatasetTuning = useCallback(async () => {
    if (!consoleToken.trim() || !selectedDatasetId) {
      setStatusLine("[ERR] Select dataset and provide dataset token.");
      return;
    }

    await runSafe(`Loading tuning profile for ${selectedDatasetId}.`, async () => {
      const [datasetRaw, boundTagsRaw] = await Promise.all([
        difyProxyRequest(consoleToken, `datasets/${selectedDatasetId}`),
        difyProxyRequest(consoleToken, `datasets/${selectedDatasetId}/tags`),
      ]);

      const dataset = datasetRaw as DatasetItem;
      const indexing = dataset.indexing_technique ?? "high_quality";
      const retrieval = normalizeRetrievalModel(dataset.retrieval_model_dict, indexing);
      const boundTags = parseArray<TagItem>(boundTagsRaw);

      setTuningName(dataset.name ?? "");
      setTuningDescription(dataset.description ?? "");
      setTuningPermission(dataset.permission ?? "only_me");
      setTuningIndexing(indexing);
      setTuningSearchMethod(retrieval.search_method);
      setTuningRerankingEnabled(retrieval.reranking_enable);
      setTuningRerankProvider(retrieval.reranking_model?.reranking_provider_name ?? "");
      setTuningRerankModel(retrieval.reranking_model?.reranking_model_name ?? "");
      setTuningTopK(retrieval.top_k);
      setTuningThresholdEnabled(retrieval.score_threshold_enabled);
      setTuningThreshold(retrieval.score_threshold);
      setTuningEmbeddingProvider(dataset.embedding_model_provider ?? "");
      setTuningEmbeddingModel(dataset.embedding_model ?? "");
      setSelectedTagIds(boundTags.map((tag) => tag.id));
    });
  }, [consoleToken, selectedDatasetId, runSafe]);

  const createTag = useCallback(async () => {
    if (!consoleToken.trim() || !newTagName.trim()) {
      setStatusLine("[ERR] Missing dataset token or tag name.");
      return;
    }

    await runSafe(`Creating tag ${newTagName.trim()}.`, async () => {
      await difyProxyRequest(consoleToken, "datasets/tags", {
        method: "POST",
        body: { name: newTagName.trim() },
      });
      setNewTagName("");
      const response = await difyProxyRequest(consoleToken, "datasets/tags");
      setTags(parseArray<TagItem>(response));
    });
  }, [consoleToken, newTagName, runSafe]);

  const applyTagBindingChanges = useCallback(async () => {
    if (!consoleToken.trim() || !selectedDatasetId) {
      throw new Error("Select dataset and provide dataset token.");
    }

      const currentlyBoundRaw = await difyProxyRequest(consoleToken, `datasets/${selectedDatasetId}/tags`);
      const currentlyBound = parseArray<TagItem>(currentlyBoundRaw).map((tag) => tag.id);

      const currentSet = new Set(currentlyBound);
      const nextSet = new Set(selectedTagIds);
      const toBind = Array.from(nextSet).filter((id) => !currentSet.has(id));
      const toUnbind = Array.from(currentSet).filter((id) => !nextSet.has(id));

      if (toBind.length > 0) {
        await difyProxyRequest(consoleToken, "datasets/tags/binding", {
          method: "POST",
          body: { target_id: selectedDatasetId, tag_ids: toBind },
        });
      }

      for (const tagId of toUnbind) {
        await difyProxyRequest(consoleToken, "datasets/tags/unbinding", {
          method: "POST",
          body: { target_id: selectedDatasetId, tag_id: tagId },
        });
      }

      await loadDatasets();
  }, [consoleToken, selectedDatasetId, selectedTagIds, loadDatasets]);

  const applyTagBinding = useCallback(async () => {
    if (!consoleToken.trim() || !selectedDatasetId) {
      setStatusLine("[ERR] Select dataset and provide dataset token.");
      return;
    }

    await runSafe(`Applying tag bindings for ${selectedDatasetId}.`, async () => {
      await applyTagBindingChanges();
    });
  }, [consoleToken, selectedDatasetId, applyTagBindingChanges, runSafe]);

  const createDataset = useCallback(async () => {
    if (!consoleToken.trim() || !newDatasetName.trim()) {
      setStatusLine("[ERR] Dataset name or dataset token missing.");
      return;
    }

    if (createRerankingEnabled && (!createRerankProvider.trim() || !createRerankModel.trim())) {
      setStatusLine("[ERR] Reranker enabled but rerank provider/model not selected.");
      return;
    }

    const retrieval = buildRetrievalModel({
      indexing: createIndexing,
      searchMethod: createSearchMethod,
      rerankingEnabled: createRerankingEnabled,
      rerankingProvider: createRerankProvider,
      rerankingModel: createRerankModel,
      topK: createTopK,
      scoreThresholdEnabled: createThresholdEnabled,
      scoreThreshold: createThreshold,
    });

    await runSafe("Creating dataset and optional file ingestion.", async () => {
      const payload: Record<string, unknown> = {
        name: newDatasetName.trim(),
        description: newDatasetDescription.trim(),
        permission: createPermission,
        indexing_technique: createIndexing,
        retrieval_model: retrieval,
      };

      if (createIndexing === "high_quality" && createEmbeddingProvider.trim() && createEmbeddingModel.trim()) {
        payload.embedding_model_provider = createEmbeddingProvider.trim();
        payload.embedding_model = createEmbeddingModel.trim();
      }

      const createResponse = (await difyProxyRequest(consoleToken, "datasets", {
        method: "POST",
        body: payload,
      })) as { id?: string };

      const datasetId = createResponse.id;
      if (!datasetId) {
        throw new Error("Dify returned no dataset ID.");
      }

      if (datasetFile) {
        const upload = new FormData();
        const dataPayload: Record<string, unknown> = {
          indexing_technique: createIndexing,
          retrieval_model: retrieval,
          process_rule: { mode: "automatic", rules: {} },
        };
        if (createIndexing === "high_quality" && createEmbeddingProvider.trim() && createEmbeddingModel.trim()) {
          dataPayload.embedding_model_provider = createEmbeddingProvider.trim();
          dataPayload.embedding_model = createEmbeddingModel.trim();
        }

        upload.append("file", datasetFile);
        upload.append("data", JSON.stringify(dataPayload));

        await difyProxyRequest(consoleToken, `datasets/${datasetId}/document/create-by-file`, {
          method: "POST",
          body: upload,
        });
      }

      setNewDatasetName("");
      setNewDatasetDescription("");
      setDatasetFile(null);
      await loadDatasets();
    });
  }, [
    consoleToken,
    newDatasetName,
    newDatasetDescription,
    createPermission,
    createIndexing,
    createSearchMethod,
    createRerankingEnabled,
    createRerankProvider,
    createRerankModel,
    createTopK,
    createThresholdEnabled,
    createThreshold,
    createEmbeddingProvider,
    createEmbeddingModel,
    datasetFile,
    loadDatasets,
    runSafe,
  ]);

  const deleteDataset = useCallback(
    async (datasetId: string) => {
      if (!consoleToken.trim()) {
        setStatusLine("[ERR] Missing Dify dataset token.");
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

  const uploadDocument = useCallback(async () => {
    if (!consoleToken.trim() || !selectedDatasetId || !documentFile) {
      setStatusLine("[ERR] Missing dataset selection, file, or token.");
      return;
    }

    const indexing = selectedDataset?.indexing_technique ?? "high_quality";
    const retrieval = normalizeRetrievalModel(selectedDataset?.retrieval_model_dict, indexing);
    const payload: Record<string, unknown> = {
      indexing_technique: indexing,
      retrieval_model: retrieval,
      process_rule: { mode: "automatic", rules: {} },
    };

    if (indexing === "high_quality" && selectedDataset?.embedding_model_provider && selectedDataset?.embedding_model) {
      payload.embedding_model_provider = selectedDataset.embedding_model_provider;
      payload.embedding_model = selectedDataset.embedding_model;
    }

    await runSafe(`Uploading document into ${selectedDatasetId}.`, async () => {
      const form = new FormData();
      form.append("file", documentFile);
      form.append("data", JSON.stringify(payload));

      await difyProxyRequest(consoleToken, `datasets/${selectedDatasetId}/document/create-by-file`, {
        method: "POST",
        body: form,
      });

      setDocumentFile(null);
      await loadDocuments();
    });
  }, [consoleToken, selectedDatasetId, documentFile, selectedDataset, loadDocuments, runSafe]);

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

  const saveDatasetTuning = useCallback(async () => {
    if (!consoleToken.trim() || !selectedDatasetId) {
      setStatusLine("[ERR] Select dataset and provide dataset token.");
      return;
    }
    if (!tuningName.trim()) {
      setStatusLine("[ERR] Dataset name cannot be empty.");
      return;
    }
    if (tuningRerankingEnabled && (!tuningRerankProvider.trim() || !tuningRerankModel.trim())) {
      setStatusLine("[ERR] Reranker enabled but rerank provider/model not selected.");
      return;
    }

    const retrieval = buildRetrievalModel({
      indexing: tuningIndexing,
      searchMethod: tuningSearchMethod,
      rerankingEnabled: tuningRerankingEnabled,
      rerankingProvider: tuningRerankProvider,
      rerankingModel: tuningRerankModel,
      topK: tuningTopK,
      scoreThresholdEnabled: tuningThresholdEnabled,
      scoreThreshold: tuningThreshold,
    });

    await runSafe(`Saving dataset settings for ${selectedDatasetId}.`, async () => {
      const payload: Record<string, unknown> = {
        name: tuningName.trim(),
        description: tuningDescription.trim(),
        permission: tuningPermission,
        indexing_technique: tuningIndexing,
        retrieval_model: retrieval,
      };

      if (tuningIndexing === "high_quality" && tuningEmbeddingProvider.trim() && tuningEmbeddingModel.trim()) {
        payload.embedding_model_provider = tuningEmbeddingProvider.trim();
        payload.embedding_model = tuningEmbeddingModel.trim();
      }

      await difyProxyRequest(consoleToken, `datasets/${selectedDatasetId}`, {
        method: "PATCH",
        body: payload,
      });

      await applyTagBindingChanges();
      await loadDatasets();
    });
  }, [
    consoleToken,
    selectedDatasetId,
    tuningName,
    tuningDescription,
    tuningPermission,
    tuningIndexing,
    tuningSearchMethod,
    tuningRerankingEnabled,
    tuningRerankProvider,
    tuningRerankModel,
    tuningEmbeddingProvider,
    tuningEmbeddingModel,
    tuningTopK,
    tuningThresholdEnabled,
    tuningThreshold,
    applyTagBindingChanges,
    loadDatasets,
    runSafe,
  ]);

  const loadApps = useCallback(async () => {
    if (!consoleToken.trim()) {
      setStatusLine("[ERR] Missing Dify dataset token.");
      return;
    }

    await runSafe("Syncing app inventory.", async () => {
      const response = await difyProxyRequest(consoleToken, "apps", { query: { page: 1, limit: 50 } });
      setApps(parseArray<AppItem>(response));
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
        } else {
          setStatusLine("[ERR] Workflow inputs must be a JSON object.");
          return;
        }
      } catch {
        setStatusLine("[ERR] Workflow inputs must be valid JSON object.");
        return;
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
      const [pathPart, queryPart] = normalized.split("?");
      const query = queryPart ? Object.fromEntries(new URLSearchParams(queryPart).entries()) : undefined;

      const response = await difyProxyRequest(token, pathPart, {
        method: explorerMethod,
        query,
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
            <p className="card-label">Knowledge API Token</p>
            <input
              type="password"
              value={consoleToken}
              onChange={(event) => setConsoleToken(event.target.value)}
              placeholder="Bearer token for /v1 datasets endpoints"
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
            <button className="neon-btn mt-2" onClick={syncControlPlane} disabled={busy}>
              Full Sync
            </button>
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
                <div className="row-actions">
                  <button className="neon-btn" onClick={loadDatasets} disabled={busy}>
                    Refresh
                  </button>
                  <button className="neon-btn" onClick={loadModelCatalog} disabled={busy}>
                    Models
                  </button>
                </div>
              </div>

              <div className="panel-grid panel-grid--knowledge">
                <input
                  className="neon-input"
                  placeholder="Dataset name"
                  value={newDatasetName}
                  onChange={(event) => setNewDatasetName(event.target.value)}
                />
                <input
                  className="neon-input"
                  placeholder="Description (optional)"
                  value={newDatasetDescription}
                  onChange={(event) => setNewDatasetDescription(event.target.value)}
                />
                <select
                  className="neon-input"
                  value={createPermission}
                  onChange={(event) => setCreatePermission(event.target.value as DatasetPermission)}
                >
                  <option value="only_me">Permission: only_me</option>
                  <option value="all_team_members">Permission: all_team_members</option>
                  <option value="partial_members">Permission: partial_members</option>
                </select>
                <select
                  className="neon-input"
                  value={createIndexing}
                  onChange={(event) => setCreateIndexing(event.target.value as IndexingTechnique)}
                >
                  <option value="high_quality">Indexing: high_quality</option>
                  <option value="economy">Indexing: economy</option>
                </select>
                <input className="neon-input" type="file" onChange={(event) => setDatasetFile(event.target.files?.[0] ?? null)} />
                <button className="neon-btn neon-btn--pink" onClick={createDataset} disabled={busy}>
                  Create / Upload
                </button>
              </div>

              <div className="panel-grid panel-grid--knowledge-advanced">
                <select
                  className="neon-input"
                  value={createSearchMethod}
                  onChange={(event) => setCreateSearchMethod(event.target.value as RetrievalMethod)}
                >
                  <option value="semantic_search">Search: semantic_search</option>
                  <option value="full_text_search">Search: full_text_search</option>
                  <option value="hybrid_search">Search: hybrid_search</option>
                  <option value="keyword_search">Search: keyword_search</option>
                </select>
                <input
                  className="neon-input"
                  type="number"
                  min={1}
                  value={createTopK}
                  onChange={(event) => setCreateTopK(Math.max(1, Number(event.target.value) || DEFAULT_TOP_K))}
                  placeholder="Top K"
                />
                <label className="inline-toggle">
                  <input
                    type="checkbox"
                    checked={createThresholdEnabled}
                    onChange={(event) => setCreateThresholdEnabled(event.target.checked)}
                  />
                  <span>Score Threshold</span>
                </label>
                <input
                  className="neon-input"
                  type="number"
                  step="0.01"
                  value={createThreshold}
                  onChange={(event) => setCreateThreshold(Number(event.target.value) || DEFAULT_SCORE_THRESHOLD)}
                  placeholder="0.5"
                />
                <label className="inline-toggle">
                  <input
                    type="checkbox"
                    checked={createRerankingEnabled}
                    onChange={(event) => setCreateRerankingEnabled(event.target.checked)}
                  />
                  <span>Enable Reranker</span>
                </label>
                <div />
                <select
                  className="neon-input"
                  value={createEmbeddingProvider}
                  onChange={(event) => setCreateEmbeddingProvider(event.target.value)}
                >
                  <option value="">Embedding Provider (auto/default)</option>
                  {embeddingProviders.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
                <select
                  className="neon-input"
                  value={createEmbeddingModel}
                  onChange={(event) => setCreateEmbeddingModel(event.target.value)}
                >
                  <option value="">Embedding Model (auto/default)</option>
                  {createEmbeddingModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
                <select
                  className="neon-input"
                  value={createRerankProvider}
                  onChange={(event) => setCreateRerankProvider(event.target.value)}
                >
                  <option value="">Rerank Provider</option>
                  {rerankProviders.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
                <select
                  className="neon-input"
                  value={createRerankModel}
                  onChange={(event) => setCreateRerankModel(event.target.value)}
                >
                  <option value="">Rerank Model</option>
                  {createRerankModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Indexing</th>
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
                            <button
                              onClick={() => {
                                setSelectedDatasetId(dataset.id);
                                setActivePanel("tuning");
                              }}
                            >
                              Tune
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

              <p className="caption">
                Selected dataset: {selectedDataset?.name ?? "none"} | indexing: {selectedDataset?.indexing_technique ?? "-"} | embedding:{" "}
                {selectedDataset?.embedding_model ? `${selectedDataset.embedding_model} (${selectedDataset.embedding_model_provider})` : "auto/default"}
              </p>

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

          {activePanel === "tuning" && (
            <div className="card panel">
              <div className="panel-head">
                <h2>Knowledge Tuning</h2>
                <div className="row-actions">
                  <button className="neon-btn" onClick={loadTags} disabled={busy}>
                    Tags
                  </button>
                  <button className="neon-btn" onClick={loadModelCatalog} disabled={busy}>
                    Models
                  </button>
                  <button className="neon-btn" onClick={loadSelectedDatasetTuning} disabled={busy}>
                    Load Selected
                  </button>
                  <button className="neon-btn neon-btn--pink" onClick={saveDatasetTuning} disabled={busy}>
                    Save
                  </button>
                </div>
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
                  value={tuningName}
                  onChange={(event) => setTuningName(event.target.value)}
                  placeholder="Dataset name"
                />
                <input
                  className="neon-input"
                  value={tuningDescription}
                  onChange={(event) => setTuningDescription(event.target.value)}
                  placeholder="Description"
                />
              </div>

              <div className="panel-grid panel-grid--knowledge-advanced">
                <select
                  className="neon-input"
                  value={tuningPermission}
                  onChange={(event) => setTuningPermission(event.target.value as DatasetPermission)}
                >
                  <option value="only_me">Permission: only_me</option>
                  <option value="all_team_members">Permission: all_team_members</option>
                  <option value="partial_members">Permission: partial_members</option>
                </select>
                <select
                  className="neon-input"
                  value={tuningIndexing}
                  onChange={(event) => setTuningIndexing(event.target.value as IndexingTechnique)}
                >
                  <option value="high_quality">Indexing: high_quality</option>
                  <option value="economy">Indexing: economy</option>
                </select>
                <select
                  className="neon-input"
                  value={tuningSearchMethod}
                  onChange={(event) => setTuningSearchMethod(event.target.value as RetrievalMethod)}
                >
                  <option value="semantic_search">Search: semantic_search</option>
                  <option value="full_text_search">Search: full_text_search</option>
                  <option value="hybrid_search">Search: hybrid_search</option>
                  <option value="keyword_search">Search: keyword_search</option>
                </select>
                <input
                  className="neon-input"
                  type="number"
                  min={1}
                  value={tuningTopK}
                  onChange={(event) => setTuningTopK(Math.max(1, Number(event.target.value) || DEFAULT_TOP_K))}
                  placeholder="Top K"
                />
                <label className="inline-toggle">
                  <input
                    type="checkbox"
                    checked={tuningThresholdEnabled}
                    onChange={(event) => setTuningThresholdEnabled(event.target.checked)}
                  />
                  <span>Score Threshold</span>
                </label>
                <input
                  className="neon-input"
                  type="number"
                  step="0.01"
                  value={tuningThreshold}
                  onChange={(event) => setTuningThreshold(Number(event.target.value) || DEFAULT_SCORE_THRESHOLD)}
                  placeholder="0.5"
                />
                <label className="inline-toggle">
                  <input
                    type="checkbox"
                    checked={tuningRerankingEnabled}
                    onChange={(event) => setTuningRerankingEnabled(event.target.checked)}
                  />
                  <span>Enable Reranker</span>
                </label>
                <div />
                <select
                  className="neon-input"
                  value={tuningEmbeddingProvider}
                  onChange={(event) => setTuningEmbeddingProvider(event.target.value)}
                >
                  <option value="">Embedding Provider (auto/default)</option>
                  {embeddingProviders.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
                <select
                  className="neon-input"
                  value={tuningEmbeddingModel}
                  onChange={(event) => setTuningEmbeddingModel(event.target.value)}
                >
                  <option value="">Embedding Model (auto/default)</option>
                  {tuningEmbeddingModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
                <select
                  className="neon-input"
                  value={tuningRerankProvider}
                  onChange={(event) => setTuningRerankProvider(event.target.value)}
                >
                  <option value="">Rerank Provider</option>
                  {rerankProviders.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
                <select
                  className="neon-input"
                  value={tuningRerankModel}
                  onChange={(event) => setTuningRerankModel(event.target.value)}
                >
                  <option value="">Rerank Model</option>
                  {tuningRerankModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>

              <div className="tag-panel">
                <p className="card-label">Metadata Tags</p>
                <div className="panel-grid panel-grid--docs">
                  <input
                    className="neon-input"
                    value={newTagName}
                    onChange={(event) => setNewTagName(event.target.value)}
                    placeholder="Create new tag"
                  />
                  <button className="neon-btn" onClick={createTag} disabled={busy}>
                    Add Tag
                  </button>
                  <button className="neon-btn" onClick={applyTagBinding} disabled={busy || !selectedDatasetId}>
                    Apply Tags
                  </button>
                </div>
                <div className="tag-wall">
                  {tags.length === 0 && <p className="caption">No tags loaded.</p>}
                  {tags.map((tag) => (
                    <label key={tag.id} className="tag-chip">
                      <input
                        type="checkbox"
                        checked={selectedTagIds.includes(tag.id)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedTagIds((current) => (current.includes(tag.id) ? current : [...current, tag.id]));
                          } else {
                            setSelectedTagIds((current) => current.filter((id) => id !== tag.id));
                          }
                        }}
                      />
                      <span>{tag.name}</span>
                    </label>
                  ))}
                </div>
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
                  onChange={(event) => setExplorerMethod(event.target.value as RequestMethod)}
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
                  <option value="console">Dataset Token</option>
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
                <button onClick={() => setExplorerPath("datasets/tags")}>GET tags</button>
                <button onClick={() => setExplorerPath("workspaces/current/models/model-types/text-embedding")}>
                  GET embedding models
                </button>
                <button onClick={() => setExplorerPath("workspaces/current/models/model-types/rerank")}>
                  GET rerank models
                </button>
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
