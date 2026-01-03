# CourseSync

CourseSync is a Next.js application that allows Berkeley students to upload a screenshot of their weekly class schedule and automatically sync it to Google Calendar as recurring events.

## Features

- 🔐 Google OAuth authentication with Calendar permissions
- 📸 Upload schedule screenshots (from CalCentral/Schedule Planner)
- 🔍 OCR-powered text extraction using Google Cloud Vision
- 📅 Automatic parsing of class schedules (course name, room, day, time, instructor)
- ✏️ Review and edit parsed class information
- 📆 Sync to Google Calendar as recurring weekly events

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, React, TailwindCSS
- **OCR**: Google Cloud Vision API
- **Authentication**: NextAuth.js with Google OAuth
- **Calendar**: Google Calendar API
- **Date Handling**: date-fns, date-fns-tz

## Prerequisites

1. Node.js 18+ and npm/yarn
2. Google Cloud Platform account with:
   - Cloud Vision API enabled
   - OAuth 2.0 credentials (Client ID and Client Secret)
   - Service account key (optional, for Vision API)
3. NextAuth secret for session encryption

## Setup

1. **Clone and install dependencies:**

```bash
npm install
```

2. **Set up Google Cloud Vision API:**

   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the Cloud Vision API
   - Either:
     - Option A: Create a service account and download the key file
     - Option B: Use Application Default Credentials (for local dev: `gcloud auth application-default login`)

3. **Set up Google OAuth credentials:**

   - Go to [Google Cloud Console > APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
   - Create OAuth 2.0 Client ID (Web application)
   - Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (and your production URL)
   - Download the Client ID and Client Secret

4. **Create `.env.local` file:**

```env
# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-random-secret-here

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback/google

# Google Cloud Vision (if using service account key file)
GOOGLE_CLOUD_KEYFILE=path/to/service-account-key.json
GOOGLE_CLOUD_PROJECT_ID=your-project-id
```

Generate a random secret for `NEXTAUTH_SECRET`:
```bash
openssl rand -base64 32
```

5. **Run the development server:**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Sign in**: Click "Sign in with Google" and authorize Calendar permissions
2. **Upload**: Upload a screenshot of your weekly schedule from CalCentral
3. **Review**: Edit class details (title, location, day, time) as needed
4. **Configure**: Set semester start/end dates and time zone
5. **Sync**: Click "Sync to Google Calendar" to create recurring events

## Project Structure

```
/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── auth/          # NextAuth OAuth handler
│   │   ├── upload/        # Image upload & OCR
│   │   └── calendar/      # Calendar sync
│   ├── upload/            # Upload page
│   ├── review/            # Review & sync page
│   └── page.tsx           # Landing page
├── components/            # React components
│   ├── FileUpload.tsx
│   ├── ClassTable.tsx
│   └── NavBar.tsx
├── lib/                   # Core services
│   ├── ocrService.ts      # Google Cloud Vision wrapper
│   ├── scheduleLayout.ts  # Schedule parsing logic
│   ├── googleCalendar.ts  # Calendar API wrapper
│   ├── googleAuth.ts      # OAuth client builder
│   └── types.ts           # TypeScript interfaces
└── tmp/                   # Temporary uploads (gitignored)
```

## How It Works

### OCR & Parsing Pipeline

1. **OCR Extraction**: Uses Google Cloud Vision to extract text with bounding boxes
2. **Time Label Detection**: Identifies time labels (e.g., "10am", "2:30pm") and builds Y-coordinate to time mapping
3. **Day Header Detection**: Identifies day headers (Monday-Friday) and builds X-coordinate to day mapping
4. **Event Clustering**: Groups text boxes by spatial proximity and day column
5. **Class Block Creation**: Parses text lines to extract title, location, instructors, and determines times from Y positions

### Calendar Sync

1. **First Occurrence**: Calculates the first occurrence of each class's day-of-week within the semester
2. **Recurrence Rule**: Creates weekly recurring events using RFC5545 RRULE format
3. **Calendar Creation**: Optionally creates a new calendar or uses primary calendar

## Limitations (MVP)

- Only supports Berkeley's standard weekly schedule layout (Monday-Friday grid)
- Requires English labels ("Monday", "10am", etc.)
- User must manually provide semester start/end dates
- No automatic detection of schedule format variations

## Error Handling

- If OCR fails: User sees error message suggesting higher-resolution screenshot
- If parsing fails: User sees error message about schedule format
- If Calendar API errors: Generic error message with details in console (dev mode)

## Development

```bash
# Run dev server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint
npm run lint
```

## License

MIT

