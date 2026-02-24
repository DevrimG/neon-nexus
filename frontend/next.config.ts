import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/knowledge-bases/:path*',
        // Use the K8s internal DNS or an environment variable. We default to the internal DB address
        destination: process.env.RAG_API_URL
          ? `${process.env.RAG_API_URL}/api/knowledge-bases/:path*`
          : 'http://neon-nexus-rag-memory.default.svc.cluster.local:8001/api/knowledge-bases/:path*',
      },
    ];
  },
};

export default nextConfig;
