import type { NextConfig } from "next";
import { networkInterfaces } from "os";

/**
 * 获取局域网 IP 地址
 * 优先返回 192.168.x.x 或 10.x.x.x 或 172.16-31.x.x 的 IP
 */
function getLocalIP(): string {
  const nets = networkInterfaces();

  for (const name of Object.keys(nets)) {
    const netArray = nets[name];
    if (!netArray) continue;

    for (const net of netArray) {
      // 跳过内部和 IPv6 地址
      if (net.internal || net.family !== 'IPv4') continue;

      const ip = net.address;
      // 优先返回私有 IP 地址
      if (
        ip.startsWith('192.168.') ||
        ip.startsWith('10.') ||
        /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)
      ) {
        return ip;
      }
    }
  }

  // 如果没有找到私有 IP，返回第一个找到的 IPv4 地址
  for (const name of Object.keys(nets)) {
    const netArray = nets[name];
    if (!netArray) continue;

    for (const net of netArray) {
      if (!net.internal && net.family === 'IPv4') {
        return net.address;
      }
    }
  }

  // 默认返回
  return '127.0.0.1';
}

const LOCAL_IP = getLocalIP();
const API_BASE = `http://${LOCAL_IP}:8080`;

const nextConfig: NextConfig = {
  reactStrictMode: false,
  allowedDevOrigins: [LOCAL_IP, '127.0.0.1', 'localhost'],
  output: "standalone",
  turbopack: {
    root: import.meta.dirname,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_BASE}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
