export class DifyProxyError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(`Dify proxy request failed (${status})`);
    this.name = "DifyProxyError";
    this.status = status;
    this.detail = detail;
  }
}

type Primitive = string | number | boolean;

type QueryParams = Record<string, Primitive | undefined | null>;

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: QueryParams;
  body?: unknown;
};

function normalizePath(path: string): string {
  return path.replace(/^\/+/, "");
}

function toSearchParams(query?: QueryParams): string {
  if (!query) return "";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }

  const asString = params.toString();
  return asString ? `?${asString}` : "";
}

function parsePossiblyJson(text: string): unknown {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function difyProxyRequest<T = unknown>(
  token: string,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  if (!token.trim()) {
    throw new Error("Missing Dify API token");
  }

  const method = options.method ?? "GET";
  const target = `/api/dify/${normalizePath(path)}${toSearchParams(options.query)}`;

  const headers = new Headers({
    Authorization: `Bearer ${token.trim()}`,
  });

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  const response = await fetch(target, { method, headers, body });
  const text = await response.text();
  const parsed = parsePossiblyJson(text);

  if (!response.ok) {
    throw new DifyProxyError(response.status, parsed);
  }

  return parsed as T;
}
