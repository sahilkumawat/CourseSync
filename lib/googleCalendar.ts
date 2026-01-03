import { google } from 'googleapis';
import { addDays, format, parse, startOfWeek } from 'date-fns';
import { zonedTimeToUtc } from 'date-fns-tz';
import type { ClassBlock, CalendarSyncPayload } from './types';

export class GoogleCalendarService {
  private calendar: ReturnType<typeof google.calendar>;

  constructor(authClient: ReturnType<typeof google.auth.OAuth2>) {
    this.calendar = google.calendar({ version: 'v3', auth: authClient });
  }

  async createCalendarIfNeeded(createNew: boolean): Promise<string> {
    if (createNew) {
      try {
        const response = await this.calendar.calendars.insert({
          requestBody: {
            summary: 'Class Schedule',
            description: 'Auto-generated class schedule from CourseSync',
          },
        });
        return response.data.id || 'primary';
      } catch (error: any) {
        // Re-throw with more context
        throw error;
      }
    }
    return 'primary';
  }

  async createRecurringEvents(
    events: ClassBlock[],
    semesterStartDate: string,
    semesterEndDate: string,
    timeZone: string,
    calendarId: string
  ): Promise<string[]> {
    const createdEventIds: string[] = [];

    for (const event of events) {
      if (!event.enabled) continue;

      try {
        const eventId = await this.createRecurringEvent(
          event,
          semesterStartDate,
          semesterEndDate,
          timeZone,
          calendarId
        );
        createdEventIds.push(eventId);
      } catch (error) {
        console.error(`Error creating event for ${event.title}:`, error);
        // Continue with other events
      }
    }

    return createdEventIds;
  }

  private async createRecurringEvent(
    event: ClassBlock,
    semesterStartDate: string,
    semesterEndDate: string,
    timeZone: string,
    calendarId: string
  ): Promise<string> {
    // Parse semester dates
    const startDate = parse(semesterStartDate, 'yyyy-MM-dd', new Date());
    const endDate = parse(semesterEndDate, 'yyyy-MM-dd', new Date());

    // Find first occurrence of the day of week
    const dayMap: Record<string, number> = {
      MO: 1,
      TU: 2,
      WE: 3,
      TH: 4,
      FR: 5,
    };

    const targetDay = dayMap[event.dayOfWeek];
    const weekStart = startOfWeek(startDate, { weekStartsOn: 0 });
    const daysToAdd = (targetDay - weekStart.getDay() + 7) % 7;
    const firstOccurrence = addDays(weekStart, daysToAdd);

    // If the first occurrence is before the start date, move to next week
    let finalFirstOccurrence = firstOccurrence;
    if (firstOccurrence < startDate) {
      const firstOccurrenceNextWeek = addDays(firstOccurrence, 7);
      if (firstOccurrenceNextWeek <= endDate) {
        finalFirstOccurrence = firstOccurrenceNextWeek;
      } else {
        throw new Error(`No occurrence of ${event.dayOfWeek} between ${semesterStartDate} and ${semesterEndDate}`);
      }
    }

    // Parse start and end times
    const [startHours, startMinutes] = event.startTime.split(':').map(Number);
    const [endHours, endMinutes] = event.endTime.split(':').map(Number);

    const startDateTime = new Date(finalFirstOccurrence);
    startDateTime.setHours(startHours, startMinutes, 0, 0);

    const endDateTime = new Date(finalFirstOccurrence);
    endDateTime.setHours(endHours, endMinutes, 0, 0);

    // Build recurrence rule
    const untilDate = format(endDate, 'yyyyMMdd');
    const rrule = `RRULE:FREQ=WEEKLY;BYDAY=${event.dayOfWeek};UNTIL=${untilDate}T235959Z`;

    // Format for Google Calendar API
    const startDateTimeStr = format(startDateTime, "yyyy-MM-dd'T'HH:mm:ss");
    const endDateTimeStr = format(endDateTime, "yyyy-MM-dd'T'HH:mm:ss");

    const requestBody: any = {
      summary: event.title,
      description: event.instructors || '',
      start: {
        dateTime: startDateTimeStr,
        timeZone,
      },
      end: {
        dateTime: endDateTimeStr,
        timeZone,
      },
      recurrence: [rrule],
    };

    // Add location only if it exists
    if (event.location && event.location.length > 0) {
      requestBody.location = event.location;
    }

    // Add color if specified
    if (event.colorId) {
      requestBody.colorId = event.colorId;
    }

    const response = await this.calendar.events.insert({
      calendarId,
      requestBody,
    });

    return response.data.id || '';
  }
}

