/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { optimizePackageImports: ["lucide-react"] },
  async rewrites() {
    const origin = process.env.CONTROL_API_ORIGIN;
    if (!origin) return [];
    return [
      {
        source: "/control-api/:path*",
        destination: `${origin.replace(/\/$/, "")}/:path*`,
      },
    ];
  },
};
export default nextConfig;
