import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  env: {
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in',
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL || '/inventory',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '',
    OWNER_USER_ID: process.env.OWNER_USER_ID || '',
    OWNER_PASSWORD: process.env.OWNER_PASSWORD || '',
    OWNER_EMAIL: process.env.OWNER_EMAIL || '',
    OWNER_CLERK_USER_ID: process.env.OWNER_CLERK_USER_ID || '',
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: 'frame-ancestors *',
          },
        ],
      },
    ];
  },
  webpack: (config) => {
    config.resolve.alias['@/lib'] = path.resolve(process.cwd(), 'src/lib');
    config.resolve.alias['@/src'] = path.resolve(process.cwd(), 'src');
    config.resolve.alias['@'] = path.resolve(process.cwd(), 'src');
    return config;
  },
};

export default nextConfig;
