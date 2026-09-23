import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Keep Next's file tracing anchored to this app. The repository also has an
  // empty root lockfile, which otherwise makes Next infer the parent folder as
  // the workspace root.
  outputFileTracingRoot: process.cwd()
};

export default nextConfig;
