/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Enable standalone output for Docker
  serverActions: {
    bodySizeLimit: '10mb',
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('request');
    }
    return config;
  },
};

export default nextConfig;

