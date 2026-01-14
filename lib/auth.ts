import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Check if email allowlist is configured
      const allowedEmails = process.env.ALLOWED_EMAILS;
      if (!allowedEmails) {
        // If no allowlist is set, allow all users (for development)
        return true;
      }

      // Parse comma-separated list of allowed emails (case-insensitive)
      const allowedList = allowedEmails
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0);

      // Check if user's email is in the allowlist
      const userEmail = user.email?.toLowerCase();
      if (!userEmail) {
        return false; // No email, deny access
      }

      return allowedList.includes(userEmail);
    },
    async jwt({ token, account }: any) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    async session({ session, token }: any) {
      session.accessToken = token.accessToken as string;
      session.refreshToken = token.refreshToken as string;
      return session;
    },
  },
  pages: {
    signIn: '/',
    error: '/unauthorized',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

