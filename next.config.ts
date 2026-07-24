import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root. There is a package-lock.json in the parent directory, and
    // without this Turbopack infers that as the root and resolves the app from the wrong
    // place — which silently serves a different project's routes.
    root: path.resolve(__dirname),
  },
}

export default nextConfig
