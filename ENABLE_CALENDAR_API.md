# Enable Google Calendar API

## Error
If you see this error:
```
Google Calendar API has not been used in project [PROJECT_ID] before or it is disabled.
```

This means the Google Calendar API needs to be enabled in your Google Cloud project.

## Solution

1. **Go to Google Cloud Console:**
   - Visit: https://console.cloud.google.com/apis/api/calendar-json.googleapis.com/overview?project=coursesync-483203
   - Or navigate manually:
     - Go to https://console.cloud.google.com/
     - Select your project: **coursesync-483203**
     - Go to "APIs & Services" > "Library"
     - Search for "Google Calendar API"
     - Click on it
     - Click the "Enable" button

2. **Wait a few minutes:**
   - After enabling, wait 2-5 minutes for the changes to propagate

3. **Try again:**
   - Go back to your CourseSync app
   - Try syncing to Google Calendar again

## Quick Link

**Direct link to enable Calendar API for your project:**
https://console.cloud.google.com/apis/api/calendar-json.googleapis.com/overview?project=coursesync-483203

Click the "Enable" button on that page.

