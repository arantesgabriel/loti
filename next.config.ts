import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
  distDir: process.env.LOTI_NEXT_DIR ?? ".next",
  ...(process.env.LOTI_NEXT_DIR?.startsWith(".next-orders-transition") ? {typescript:{tsconfigPath:"tsconfig.orders-transition.json"}} : {}),
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }, { source: "/invite/:path*", headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "private, no-store" },
    ] }, ...["/forgot-password", "/reset-password", "/verify-email", "/api/auth/:path*"].map(source => ({ source, headers: [
      { key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "private, no-store" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ] }))];
  },
};
export default config;
