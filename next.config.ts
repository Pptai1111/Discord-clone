import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images:{
    domains:[
      "uploadthing.com",
      "utfs.io",
    ]
  }
}

module.exports = {
  eslint: {
    ignoreDuringBuilds: true,
  },
};





export default nextConfig;
