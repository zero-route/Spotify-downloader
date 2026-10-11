import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/mp3": ["./node_modules/ffmpeg-static/**/*"],
  },
};

export default nextConfig;
