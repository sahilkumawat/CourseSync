/** @type {import('next').NextConfig} */
const nextConfig = {
  serverActions: {
    bodySizeLimit: '10mb',
  },
  webpack: (config, { isServer }) => {
    // Suppress warnings about missing 'request' module from @google-cloud/vision
    // This is only used server-side in API routes, so it's safe to ignore
    if (isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        request: false,
      };
    }
    return config;
  },
};

export default nextConfig;

