/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
        ],
      },
    ]
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"
    // Strip /api/v1 suffix if present so we can mount at /api/v1
    const base = apiUrl.replace(/\/api\/v1\/?$/, "")
    return [
      {
        source: "/api/v1/:path*",
        destination: `${base}/api/v1/:path*`,
      },
      {
        source: "/static/:path*",
        destination: `${base}/static/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
