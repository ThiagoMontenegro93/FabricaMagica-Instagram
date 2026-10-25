/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Os pacotes do monorepo são TypeScript puro; o Next transpila.
  transpilePackages: ["@fabrica/shared", "@fabrica/db"],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
