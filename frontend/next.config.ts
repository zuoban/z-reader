import type { NextConfig } from "next";

function parseCSV(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const SERVER_API_BASE =
  process.env.NEXT_SERVER_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8080";

const allowedDevOrigins = parseCSV(process.env.NEXT_DEV_ALLOWED_ORIGINS);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    agentUpgrade: "security",
    optimizePackageImports: ["@mantine/core", "@mantine/hooks"],
    proxyTimeout: 120_000,
  },
  allowedDevOrigins: Array.from(
    new Set(["127.0.0.1", "localhost", ...allowedDevOrigins])
  ),
  output: "standalone",
  turbopack: {
    root: import.meta.dirname,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${SERVER_API_BASE}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/foliate/built/:version/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/foliate/vendor/:path*",
        has: [{ type: "query", key: "v" }],
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
