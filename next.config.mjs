/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Headroom for pasting/uploading a CommunityMentions CSV export via a Server Action.
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
