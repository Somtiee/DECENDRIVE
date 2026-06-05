/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@mysten/walrus", "@mysten/walrus-wasm"],
};

export default nextConfig;
