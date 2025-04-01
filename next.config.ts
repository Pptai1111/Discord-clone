import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "utfs.io",
      },
      {
        protocol: "https",
        hostname: "uploadthing",
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  experimental: {
    // Tắt SSR cho API routes
    serverActions: {
      allowedOrigins: ["localhost:3000"]
    },
    // Cải thiện hydration
    optimizeCss: true
  },
  onDemandEntries: {
    // Giữ các trang được tạo lâu hơn trong bộ nhớ cache
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 5,
  }
};

export default nextConfig;