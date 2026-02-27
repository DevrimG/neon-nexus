import { NextResponse } from "next/server";

const DIFY_API_URL =
  process.env.DIFY_API_URL || "http://dify-api-svc.dify-system.svc.cluster.local:5001/v1";

type Params = { path: string[] };

type RouteContext = {
  params: Promise<Params>;
};

async function proxyDifyRequest(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;

  if (!path || path.length === 0) {
    return NextResponse.json({ error: "Missing Dify endpoint path" }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Missing Dify API key" }, { status: 401 });
  }

  const upstreamBase = DIFY_API_URL.replace(/\/$/, "");
  const incomingUrl = new URL(request.url);
  const targetUrl = `${upstreamBase}/${path.join("/")}${incomingUrl.search}`;

  const outgoingHeaders = new Headers();
  outgoingHeaders.set("Authorization", authHeader);

  const contentType = request.headers.get("content-type");
  if (contentType) {
    outgoingHeaders.set("Content-Type", contentType);
  }

  const accept = request.headers.get("accept");
  if (accept) {
    outgoingHeaders.set("Accept", accept);
  }

  let body: BodyInit | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.arrayBuffer();
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: outgoingHeaders,
      body,
      redirect: "manual",
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    const responseType = response.headers.get("content-type");
    if (responseType) {
      responseHeaders.set("content-type", responseType);
    }

    const payload = await response.arrayBuffer();
    return new NextResponse(payload, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown proxy failure";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(request: Request, context: RouteContext) {
  return proxyDifyRequest(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyDifyRequest(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  return proxyDifyRequest(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  return proxyDifyRequest(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return proxyDifyRequest(request, context);
}
