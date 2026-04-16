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
  reactStrictMode: false,
  allowedDevOrigins:
    allowedDevOrigins.length > 0 ? allowedDevOrigins : ["127.0.0.1", "localhost"],
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
};

export default nextConfig;
