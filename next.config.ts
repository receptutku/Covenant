import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root. There is a package-lock.json in the parent directory, and
    // without this Turbopack infers that as the root and resolves the app from the wrong
    // place — which silently serves a different project's routes.
    root: path.resolve(__dirname),
  },
  experimental: {
    // Raised from the 10MB default, which the document upload path exceeds.
    //
    // `/api/attest` accepts 3 files of 5MB — 15MB raw, ~20MB once base64-encoded into
    // JSON. Next buffers the request body whenever a proxy is present (ours adds CORS for
    // the frontend), and past the cap it silently TRUNCATES rather than rejecting: the
    // handler then fails to parse the fragment and answers "Request body is not valid
    // JSON". A seller uploading three perfectly legal documents would be told their
    // request was malformed.
    //
    // Reproduced at 17.2MB with three 4.5MB files, each well inside the documented limit.
    // 25MB leaves headroom above the 20MB worst case for JSON overhead.
    proxyClientMaxBodySize: '25mb',
  },
}

export default nextConfig
