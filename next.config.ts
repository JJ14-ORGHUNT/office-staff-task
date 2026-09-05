import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js blocks cross-origin requests to dev-only assets (JS chunks, HMR
  // websocket) by default -- without this, loading the app from a phone via
  // the LAN IP fetches the initial HTML fine but every _next/static chunk
  // 403s, so React never hydrates: buttons look real but have no handlers,
  // and forms can't submit. Add the LAN IP here (matched by hostname only,
  // no protocol/port) whenever it changes -- e.g. a different Wi-Fi network.
  allowedDevOrigins: ["192.168.1.8"],
};

export default nextConfig;
