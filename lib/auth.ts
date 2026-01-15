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
      // Allowed emails list (hardcoded)
      const allowedEmails = [
        'sahilk_17@berkeley.edu',
        'neeleshbokkisam@berkeley.edu',
        'shyong05@berkeley.edu',
        'shiama@berkeley.edu',
        'avanik@berkeley.edu',
        'krisha.prabakaran@berkeley.edu',
        'willchang@berkeley.edu',
        'tylerdee@berkeley.edu',
      ];

      // Check if user's email is in the allowlist
      const userEmail = user.email?.toLowerCase();
      if (!userEmail) {
        return false; // No email, deny access
      }

      return allowedEmails.includes(userEmail);
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

