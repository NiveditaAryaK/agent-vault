import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @xenova/transformers uses native ONNX bindings — must stay server-side only.
  // This prevents Next.js from trying to bundle it for the browser.
  serverExternalPackages: ["@xenova/transformers"],
};

export default nextConfig;
