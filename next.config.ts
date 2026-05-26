import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/health",
        destination: "/api/health",
      },
      {
        source: "/webhook",
        destination: "/api/webhook",
      },
    ];
  },
};

export default nextConfig;
