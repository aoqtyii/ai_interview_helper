import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    WEB_PUBLIC_API_BASE_URL: process.env.WEB_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'
  }
};

export default nextConfig;
