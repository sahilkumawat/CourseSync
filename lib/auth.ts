import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

/**
 * Refresh an expired Google access token using the stored refresh token.
 * Returns an updated token object. On failure, the token is flagged with
 * `error: 'RefreshAccessTokenError'` so the session/client can force re-auth.
 */
async function refreshGoogleAccessToken(token: any) {
  try {
    if (!token.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }),
    });

    const refreshed = await response.json();

    if (!response.ok) {
      throw refreshed;
    }

    return {
      ...token,
      accessToken: refreshed.access_token,
      // Google returns expires_in (seconds); convert to an absolute epoch (seconds).
      expiresAt: Math.floor(Date.now() / 1000) + refreshed.expires_in,
      // Google only returns a new refresh token if rotation is enabled; keep the old one otherwise.
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (error) {
    console.error('Error refreshing Google access token:', error);
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }
}

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
        'sahil.kumawat.05@gmail.com',
      ];

      // Check if user's email is in the allowlist
      const userEmail = user.email?.toLowerCase();
      if (!userEmail) {
        return false; // No email, deny access
      }

      return allowedEmails.includes(userEmail);
    },
    async jwt({ token, account }: any) {
      // Initial sign-in: persist the tokens from the Google account.
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at; // absolute epoch in seconds
        return token;
      }

      // Subsequent calls: return the existing token if it's still valid.
      // Refresh 60s early to avoid races on requests that fire right at expiry.
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (token.expiresAt && nowSeconds < token.expiresAt - 60) {
        return token;
      }

      // Access token has expired (or is about to) — refresh it.
      return refreshGoogleAccessToken(token);
    },
    async session({ session, token }: any) {
      session.accessToken = token.accessToken as string;
      session.refreshToken = token.refreshToken as string;
      // Surface refresh failures so the client can prompt a re-sign-in.
      session.error = token.error;
      return session;
    },
  },
  pages: {
    signIn: '/',
    error: '/unauthorized',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

