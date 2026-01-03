import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { buildGoogleAuthClient } from '@/lib/googleAuth';
import { GoogleCalendarService } from '@/lib/googleCalendar';
import type { CalendarSyncPayload } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CalendarSyncPayload = await request.json();
    const { semesterStartDate, semesterEndDate, timeZone, events, createNewCalendar } = body;

    if (!semesterStartDate || !semesterEndDate || !timeZone || !events) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Build authenticated Google client
    const authClient = buildGoogleAuthClient(
      session.accessToken,
      session.refreshToken
    );

    const calendarService = new GoogleCalendarService(authClient);

    // Create calendar if needed
    const calendarId = await calendarService.createCalendarIfNeeded(createNewCalendar);

    // Create events
    const eventIds = await calendarService.createRecurringEvents(
      events,
      semesterStartDate,
      semesterEndDate,
      timeZone,
      calendarId
    );

    return NextResponse.json({
      success: true,
      eventIds,
      calendarId,
      count: eventIds.length,
    });
  } catch (error: any) {
    console.error('Calendar sync error:', error);
    
    // Check for specific API errors
    if (error?.code === 403 && error?.message?.includes('API has not been used')) {
      return NextResponse.json(
        { 
          error: 'Google Calendar API is not enabled. Please enable it in Google Cloud Console and try again.',
          details: error.message,
          enableUrl: 'https://console.cloud.google.com/apis/api/calendar-json.googleapis.com/overview?project=' + process.env.GOOGLE_CLOUD_PROJECT_ID
        },
        { status: 500 }
      );
    }
    
    if (error?.code === 401 || error?.code === 403) {
      return NextResponse.json(
        { 
          error: 'Authentication failed. Please sign out and sign in again.',
          details: error.message
        },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to sync to Google Calendar',
        details: error?.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

