# CourseSync Setup Checklist

## Prerequisites
- [ ] Node.js 18+ installed (check with `node --version`)
- [ ] npm or yarn installed (check with `npm --version`)
- [ ] Google Cloud Platform account
- [ ] Google account for testing

## Google Cloud Setup
- [ ] Created a Google Cloud Project (or using existing one)
- [ ] Enabled Google Cloud Vision API
- [ ] Created OAuth 2.0 Client ID (Web application)
  - [ ] Added authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
  - [ ] Downloaded Client ID and Client Secret
- [ ] Set up authentication for Cloud Vision API (choose one):
  - [ ] Option A: Service Account Key File (recommended for local dev)
  - [ ] Option B: Application Default Credentials (`gcloud auth application-default login`)

## Local Project Setup
- [ ] Cloned/downloaded the project
- [ ] Installed dependencies: `npm install`
- [ ] Created `.env.local` file from `env.example`
- [ ] Generated NextAuth secret: `openssl rand -base64 32`
- [ ] Filled in all environment variables in `.env.local`:
  - [ ] `NEXTAUTH_URL=http://localhost:3000`
  - [ ] `NEXTAUTH_SECRET` (from generated secret)
  - [ ] `GOOGLE_CLIENT_ID` (from OAuth credentials)
  - [ ] `GOOGLE_CLIENT_SECRET` (from OAuth credentials)
  - [ ] `GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback/google`
  - [ ] `GOOGLE_CLOUD_KEYFILE` (if using service account)
  - [ ] `GOOGLE_CLOUD_PROJECT_ID` (your GCP project ID)

## Testing
- [ ] Started dev server: `npm run dev`
- [ ] Opened browser to `http://localhost:3000`
- [ ] Signed in with Google successfully
- [ ] Uploaded a test schedule screenshot
- [ ] Verified classes were parsed correctly
- [ ] Synced events to Google Calendar
- [ ] Verified events appear in Google Calendar

## Troubleshooting
If something doesn't work:
- [ ] Check browser console for errors
- [ ] Check terminal/server logs for errors
- [ ] Verify all environment variables are set correctly
- [ ] Verify Google OAuth redirect URI matches exactly
- [ ] Verify Cloud Vision API is enabled
- [ ] Verify authentication credentials are valid

