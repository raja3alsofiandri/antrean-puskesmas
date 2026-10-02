/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.NODE_ENV === 'development' 
          ? 'http://127.0.0.1:5328/api/:path*' // Saat di laptop, arahkan ke Python lokal
          : '/api/:path*', // Saat di Vercel online, biarkan Vercel yang urus
      },
    ];
  },
};

export default nextConfig;