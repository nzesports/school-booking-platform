import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local development may be opened through 127.0.0.1 when localhost cookies
  // are too large. Allow that origin so Next can serve client chunks and HMR
  // instead of leaving interactive controls unhydrated.
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // Resource files are validated to 40 MB in lib/services/storage.ts.
    // Leave room for the remaining multipart form fields and encoding overhead.
    proxyClientMaxBodySize: "45mb",
    serverActions: {
      bodySizeLimit: "45mb"
    }
  }
};

export default nextConfig;
