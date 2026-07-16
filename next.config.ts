import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const freshDocumentHeaders = [
      {
        key: "Cache-Control",
        value: "no-store, max-age=0, must-revalidate",
      },
    ];

    return [
      {
        source: "/",
        headers: freshDocumentHeaders,
      },
      {
        source: "/course/:path*",
        headers: freshDocumentHeaders,
      },
    ];
  },
};

export default nextConfig;
