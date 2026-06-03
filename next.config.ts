import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // NODE_ENV=development in shell + Turbopack prod build causes
    // "Cannot read properties of null (reading 'useContext')" during
    // prerendering of /_global-error. Webpack doesn't have this bug.
    turbopackMinify: false,
  },
};

export default nextConfig;
