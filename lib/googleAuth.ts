import { google } from 'googleapis';

/**
 * Resolve the OAuth redirect URI from config. Prefers an explicit
 * GOOGLE_REDIRECT_URI; otherwise derives it from NEXTAUTH_URL. Throws a clear
 * error if neither is set, instead of silently building "undefined/api/..."
 * which surfaces to users as an "invalid request / redirect_uri_mismatch".
 */
function resolveRedirectUri(): string {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  if (process.env.NEXTAUTH_URL) {
    return `${process.env.NEXTAUTH_URL}/api/auth/callback/google`;
  }
  throw new Error(
    'OAuth redirect URI is not configured: set GOOGLE_REDIRECT_URI or NEXTAUTH_URL.'
  );
}

export function buildGoogleAuthClient(accessToken: string, refreshToken?: string) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth client is not configured: missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET.');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    resolveRedirectUri()
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return oauth2Client;
}
