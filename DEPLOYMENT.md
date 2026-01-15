# Deployment Guide - Google Cloud Platform (GCP)

This guide covers deploying CourseSync to Google Cloud Platform with public access, but restricted authentication (allowlist-only).

## Quick Overview

Your application is already configured correctly! The allowlist check happens in the `signIn` callback (`lib/auth.ts`), which runs during authentication. Users not in the allowlist will be redirected to `/unauthorized` and cannot access any part of the application.

GCP is an excellent choice since you're already using Google Cloud Vision API and Calendar API, and you can leverage Application Default Credentials for seamless authentication.

## Deployment Platform: Cloud Run (Recommended)

Cloud Run is serverless, scales automatically, and has a generous free tier. It's perfect for Next.js applications.

### Prerequisites

1. **Google Cloud SDK installed:**
   ```bash
   # macOS
   brew install google-cloud-sdk
   
   # Or download from: https://cloud.google.com/sdk/docs/install
   ```

2. **Authenticate and set project:**
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

3. **Enable required APIs:**
   ```bash
   gcloud services enable run.googleapis.com
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable vision.googleapis.com
   gcloud services enable calendar-json.googleapis.com
   ```

### Step 1: Update next.config.mjs for Standalone Output

Update `next.config.mjs` to enable standalone output for Docker:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Enable standalone output for Docker
  serverActions: {
    bodySizeLimit: '10mb',
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('request');
    }
    return config;
  },
};

export default nextConfig;
```

### Step 2: Create Dockerfile

Create `Dockerfile` in project root:

```dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

### Step 3: Build and Deploy to Cloud Run

1. **Build the Docker image:**
   ```bash
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/coursesync
   ```

2. **Deploy to Cloud Run (first time):**
   ```bash
   gcloud run deploy coursesync \
     --image gcr.io/YOUR_PROJECT_ID/coursesync \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars NEXTAUTH_URL=https://coursesync-XXXXX-uc.a.run.app \
     --set-env-vars NEXTAUTH_SECRET=your-production-secret \
     --set-env-vars GOOGLE_CLIENT_ID=your-client-id \
     --set-env-vars GOOGLE_CLIENT_SECRET=your-client-secret \
     --set-env-vars GOOGLE_REDIRECT_URI=https://coursesync-XXXXX-uc.a.run.app/api/auth/callback/google \
     --set-env-vars GOOGLE_CLOUD_PROJECT_ID=YOUR_PROJECT_ID \
     --set-env-vars ALLOWED_EMAILS=user1@berkeley.edu,user2@berkeley.edu \
     --memory 1Gi \
     --timeout 300 \
     --max-instances 10
   ```

   **Note:** Replace `XXXXX` with the actual Cloud Run URL after first deployment. After the first deployment, you'll get the actual URL, then update the environment variables and redeploy.

3. **Get the service URL after deployment:**
   ```bash
   gcloud run services describe coursesync --region us-central1 --format 'value(status.url)'
   ```

4. **Update environment variables with the actual URL:**
   ```bash
   gcloud run services update coursesync \
     --update-env-vars NEXTAUTH_URL=https://your-actual-url.run.app \
     --update-env-vars GOOGLE_REDIRECT_URI=https://your-actual-url.run.app/api/auth/callback/google \
     --region us-central1
   ```

   **Alternative: Set environment variables via Console:**
   - Go to Cloud Run → your service → Edit & Deploy New Revision
   - Under "Variables & Secrets", add all environment variables:
     - `NEXTAUTH_URL`: Your Cloud Run service URL
     - `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`
     - `GOOGLE_CLIENT_ID`: Your OAuth client ID
     - `GOOGLE_CLIENT_SECRET`: Your OAuth client secret
     - `GOOGLE_REDIRECT_URI`: `https://your-service-url.run.app/api/auth/callback/google`
     - `GOOGLE_CLOUD_PROJECT_ID`: Your GCP project ID
     - `ALLOWED_EMAILS`: Comma-separated list (no spaces): `user1@berkeley.edu,user2@berkeley.edu`
   - Deploy

### Step 4: Configure Service Account for Vision API

Since Cloud Run runs in a GCP environment, you can use Application Default Credentials (ADC). No service account key files needed!

1. **Grant Vision API access to Cloud Run service account:**
   ```bash
   # Get your project number
   PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)')
   
   # Grant Vision API access
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --role="roles/ml.developer"
   ```

2. **Your `lib/ocrService.ts` already works with ADC:**
   - The current code will automatically use Application Default Credentials
   - No code changes needed!

### Step 5: Update Google OAuth Credentials

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Edit your OAuth 2.0 Client ID
3. Add authorized redirect URI: `https://your-service-url.run.app/api/auth/callback/google`
4. Add authorized JavaScript origin: `https://your-service-url.run.app`
5. Save changes

### Step 6: Configure the Allowlist

In Cloud Run environment variables:

1. Set variable: `ALLOWED_EMAILS`
2. Value: Comma-separated list of emails (no spaces):
   ```
   user1@berkeley.edu,user2@berkeley.edu,admin@example.com
   ```

3. **Important:** Make sure this variable is set in production! If it's not set, ALL authenticated users will be allowed (not what you want for production).

**Update allowlist:**
```bash
gcloud run services update coursesync \
  --update-env-vars ALLOWED_EMAILS=new-email@berkeley.edu,another@email.com \
  --region us-central1
```

Or via Console: Cloud Run → Service → Edit → Variables & Secrets → Deploy

### Step 7: Configure Custom Domain (Optional)

```bash
gcloud run domain-mappings create \
  --service coursesync \
  --domain yourdomain.com \
  --region us-central1
```

## Alternative: App Engine

App Engine is GCP's PaaS platform, simpler than Cloud Run but less flexible.

### Step 1: Create `app.yaml`

```yaml
runtime: nodejs18

env_variables:
  NEXTAUTH_URL: https://YOUR_PROJECT_ID.uc.r.appspot.com
  NEXTAUTH_SECRET: your-production-secret
  GOOGLE_CLIENT_ID: your-client-id
  GOOGLE_CLIENT_SECRET: your-client-secret
  GOOGLE_REDIRECT_URI: https://YOUR_PROJECT_ID.uc.r.appspot.com/api/auth/callback/google
  GOOGLE_CLOUD_PROJECT_ID: YOUR_PROJECT_ID
  ALLOWED_EMAILS: user1@berkeley.edu,user2@berkeley.edu

automatic_scaling:
  min_instances: 0
  max_instances: 10
```

### Step 2: Deploy

```bash
gcloud app deploy
```

**Note:** App Engine also uses Application Default Credentials automatically. No service account keys needed!

## How It Works in Production

1. **Public Access:** Anyone can visit your Cloud Run service URL
2. **Landing Page:** Users see the sign-in button
3. **Authentication:** Users click "Sign in with Google" → OAuth flow starts
4. **Allowlist Check:** After Google authentication, the `signIn` callback (`lib/auth.ts`) checks if the user's email is in `ALLOWED_EMAILS`
5. **Authorized Users:** If email is in allowlist → session created → can use the app
6. **Unauthorized Users:** If email is NOT in allowlist → redirected to `/unauthorized` → cannot access any features

## GCP-Specific Benefits

- **Application Default Credentials:** No need for service account key files - GCP automatically provides credentials
- **Integrated Billing:** All APIs (Vision, Calendar) in one billing account
- **Cloud Logging:** Automatic logging to Cloud Logging
- **Cloud Monitoring:** Built-in monitoring and alerting
- **VPC Integration:** Can integrate with other GCP services if needed

## Cost Considerations

- **Cloud Run:** Free tier: 2 million requests/month, 360,000 GB-seconds memory, 180,000 vCPU-seconds
- **App Engine:** Free tier: 28 instance-hours/day
- **Vision API:** First 1,000 units/month free, then $1.50 per 1,000 units
- **Calendar API:** Free (quota limits apply)

## Testing Production Deployment

1. **Test with allowed email:**
   - Sign in with an email in your allowlist
   - Verify you can upload and sync schedules

2. **Test with unauthorized email:**
   - Sign in with an email NOT in your allowlist
   - Verify you're redirected to `/unauthorized`
   - Verify you cannot access `/upload` or `/review` pages

3. **Test OAuth redirect:**
   - Verify redirect URI in Google Cloud Console matches production URL exactly
   - Test sign-in flow end-to-end

## Security Checklist

- [ ] `ALLOWED_EMAILS` is set in production environment
- [ ] `NEXTAUTH_SECRET` is a strong, random secret (different from local dev)
- [ ] Google OAuth redirect URI matches production URL exactly
- [ ] Service account has "ML Developer" role for Vision API (Cloud Run uses default service account)
- [ ] `.env.local` is in `.gitignore` (never commit secrets)
- [ ] Production URL uses HTTPS (Cloud Run provides this automatically)
- [ ] Cloud Run service is publicly accessible but authentication is restricted via allowlist

## Troubleshooting

### "Unauthorized" page shows for allowed users
- Check `ALLOWED_EMAILS` format (comma-separated, no spaces, case-insensitive matching)
- Verify email matches exactly (check for typos)
- Check Cloud Run environment variables are deployed (redeploy after adding)
- View logs: `gcloud run services logs read coursesync --region us-central1`

### OAuth redirect errors
- Verify redirect URI in Google Cloud Console matches exactly
- Check `NEXTAUTH_URL` matches your Cloud Run service URL
- Verify `GOOGLE_REDIRECT_URI` matches `NEXTAUTH_URL/api/auth/callback/google`
- View logs for detailed error messages

### Vision API errors
- Verify service account has "ML Developer" role (or "Cloud Vision API User")
- Check `GOOGLE_CLOUD_PROJECT_ID` is correct
- Verify Vision API is enabled: `gcloud services enable vision.googleapis.com`
- View logs: `gcloud run services logs read coursesync --region us-central1`

### Build errors
- Check Dockerfile syntax
- Verify all dependencies are in `package.json`
- Check build logs: `gcloud builds list` then `gcloud builds log BUILD_ID`

### Service won't start
- Check memory allocation (minimum 512Mi, recommended 1Gi)
- Verify environment variables are set correctly
- Check logs: `gcloud run services logs read coursesync --region us-central1`

## Useful Commands

```bash
# View service logs
gcloud run services logs read coursesync --region us-central1

# View service details
gcloud run services describe coursesync --region us-central1

# Update environment variables
gcloud run services update coursesync \
  --update-env-vars KEY=value \
  --region us-central1

# Get service URL
gcloud run services describe coursesync --region us-central1 --format 'value(status.url)'

# List all services
gcloud run services list

# Delete service (if needed)
gcloud run services delete coursesync --region us-central1
```

## Next Steps After Deployment

1. Test with a few users from your allowlist
2. Monitor Cloud Run logs for errors
3. Set up error tracking (Sentry, etc.)
4. Monitor API usage in Google Cloud Console
5. Set up budget alerts for Google Cloud APIs
6. Configure Cloud Monitoring alerts for errors
7. Set up Cloud Logging exports if needed
