import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    // The middleware buffers request bodies (default cap 10 MB, silently truncated).
    // Uploads are limited by MAX_UPLOAD_MB in the upload route; this is just the ceiling.
    middlewareClientMaxBodySize: "1gb",
  },
};

export default nextConfig;
