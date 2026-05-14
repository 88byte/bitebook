import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // v28.1.0b.5 — Bump Server Actions body size limit. The default
  // is 1 MB, which silently fails 2–5 MB iPhone photos with a 413
  // that React's RSC layer surfaces as "An unexpected response was
  // received from the server." 6 MB covers our 5 MB logo cap with
  // a little headroom for the multipart envelope + other form fields.
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
};

export default nextConfig;
