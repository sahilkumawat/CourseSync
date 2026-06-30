# CourseSync

<img width="1728" height="991" alt="Screenshot 2026-06-29 at 5 52 37 PM" src="https://github.com/user-attachments/assets/43b56b0f-590f-4eb5-9702-282337326551" />

<img width="1728" height="993" alt="Screenshot 2026-06-29 at 5 56 21 PM" src="https://github.com/user-attachments/assets/f01883eb-76b4-43ac-b6f4-848733aae3d3" />



CourseSync is a Next.js application that allows Berkeley students to upload a screenshot of their weekly class schedule and automatically sync it to Google Calendar as recurring events. The production site is available at `https://coursesyncer.com`. (video demo under construction)

## Features

- 🔐 Google OAuth authentication with Calendar permissions
- 📸 Upload schedule screenshots (from CalCentral/Schedule Planner)
- 🔍 OCR-powered text extraction using Google Cloud Vision
- 📅 Automatic parsing of class schedules (course name, room, day, time, instructor)
- ✏️ Review and edit parsed class information
- 🎨 Color picker for each class (matches Google Calendar colors)
- 📆 Sync to Google Calendar as recurring weekly events with colors
- ⏱️ Supports class durations from 60-180+ minutes (in 30-minute increments)
- 🎯 Works with classes from any department (not limited to specific keywords)

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, React, TailwindCSS
- **OCR**: Google Cloud Vision API
- **Authentication**: NextAuth.js with Google OAuth
- **Calendar**: Google Calendar API
- **Date Handling**: date-fns v3, date-fns-tz v3

## Usage

1. **Sign in**: Click "Sign in with Google" and authorize Calendar permissions
2. **Upload**: Upload a screenshot of your weekly schedule from CalCentral
3. **Review**: Edit class details (title, location, day, time, color) as needed
4. **Configure**: Set semester start/end dates and time zone
5. **Sync**: Click "Sync to Google Calendar" to create recurring events with colors
6. **View**: Click "Open Google Calendar" to view your synced classes

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
│   ├── FileUpload.tsx     # Drag-and-drop file upload
│   ├── ClassTable.tsx     # Editable class table with color picker
│   ├── ColorPicker.tsx    # Google Calendar-style color picker
│   └── NavBar.tsx         # Navigation bar with sign out
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
2. **Time Label Detection**: Identifies time labels (e.g., "10am", "2:30pm") and builds Y-coordinate to time mapping with slot height calculation
3. **Day Header Detection**: Identifies day headers (Monday-Friday) and builds X-coordinate to day mapping
4. **Event Clustering**: Groups text boxes by spatial proximity and day column
5. **Class Block Creation**: 
   - Parses text lines to extract title, location, instructors (handles any department, not just specific keywords)
   - Calculates start time from top Y-coordinate (rounded to nearest half-hour)
   - Calculates end time from bottom Y-coordinate + 45 minutes (rounded to nearest half-hour)
   - Supports class durations from 60-180+ minutes
6. **Color Assignment**: Automatically assigns unique colors to each class based on title (same course = same color)

### Calendar Sync

1. **First Occurrence**: Calculates the first occurrence of each class's day-of-week within the semester
2. **Recurrence Rule**: Creates weekly recurring events using RFC5545 RRULE format
3. **Calendar Creation**: Optionally creates a new calendar or uses primary calendar
4. **Event Creation**: Creates events with assigned colors, location (if available), and instructor information
5. **Post-Sync**: Provides direct link to Google Calendar to view synced events

## Key Features & Improvements

- **Robust Parsing**: Works with classes from any department (Music, History, etc.) - not limited to specific keywords
- **Flexible Durations**: Supports class durations from 60-180+ minutes (rounded to 30-minute increments)
- **Color Coding**: Each class gets a unique color automatically, editable via Google Calendar-style color picker
- **Smart Time Calculation**: Uses slot height offset for accurate time mapping, handles edge cases (classes with only titles, etc.)
- **User-Friendly Review**: Edit all class details before syncing, with direct link to Google Calendar after sync

## Limitations (MVP)

- Only supports Berkeley's standard weekly schedule layout (Monday-Friday grid)
- Requires English labels ("Monday", "10am", etc.)
- User must manually provide semester start/end dates
- No automatic detection of schedule format variations
- Times are rounded to nearest half-hour (:00 or :30)

## Access Control

- **Email Allowlist**: Optionally restrict access to specific email addresses
- Configure `ALLOWED_EMAILS` in `.env.local` as a comma-separated list (e.g., `user1@berkeley.edu,user2@berkeley.edu`)
- If `ALLOWED_EMAILS` is not set, all authenticated users are allowed (for development)
- Unauthorized users see an access restricted message and cannot use the service

## Error Handling

- If OCR fails: User sees error message suggesting higher-resolution screenshot
- If parsing fails: User sees error message about schedule format
- If Calendar API errors: Generic error message with details in console (dev mode)
- If email not in allowlist: User is redirected to unauthorized page

## License

MIT

