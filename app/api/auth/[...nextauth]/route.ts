import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

// Extend NextAuth types
declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
  }
}
