/**
 * Next.js configuration for StyleSeeker Import Worker
 * API-only configuration optimized for long-running import tasks
 */

/** @type {import("next").NextConfig} */
const config = {
  // Disable static optimization since we're API-only
  output: "standalone",

  // Disable image optimization since we don't serve images
  images: {
    unoptimized: true,
  },

  // Increase API timeout for long-running import operations
  experimental: {
    // Increase function timeout for imports (in seconds)
    // Note: This may need adjustment based on deployment platform
  },

  // Optimize for API routes only
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Optimize for server-side only since we don't have a frontend
      config.optimization.splitChunks = false;
    }
    return config;
  },
};

export default config;
