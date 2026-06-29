import { google } from 'googleapis';
import { addDays, format, parse, startOfWeek } from 'date-fns';
import type { ClassBlock, CalendarSyncPayload } from './types';

// Result of attempting to create every event in a sync request.
export interface CreateEventsResult {
  eventIds: string[];
  failures: { title: string; reason: string }[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Google Calendar rate-limit / transient errors that are worth retrying.
function isRetryable(error: any): boolean {
  const code = error?.code ?? error?.response?.status;
  if (code === 429 || code === 403) {
    // 403 is only retryable when it's a rate-limit (not a permissions/auth failure).
    const reason =
      error?.errors?.[0]?.reason ?? error?.response?.data?.error?.errors?.[0]?.reason ?? '';
    if (code === 403) {
      return reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded';
    }
    return true;
  }
  // Transient server-side errors.
  return code === 500 || code === 503;
}

export class GoogleCalendarService {
  private calendar: ReturnType<typeof google.calendar>;

  // Spacing between event inserts to stay under Calendar's per-user write limits.
  private static readonly THROTTLE_MS = 150;
  private static readonly MAX_RETRIES = 4;

  constructor(authClient: InstanceType<typeof google.auth.OAuth2>) {
    this.calendar = google.calendar({ version: 'v3', auth: authClient });
  }

  // Run an API call with exponential backoff on retryable (rate-limit / transient) errors.
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await fn();
      } catch (error: any) {
        attempt++;
        if (attempt > GoogleCalendarService.MAX_RETRIES || !isRetryable(error)) {
          throw error;
        }
        // 0.5s, 1s, 2s, 4s ... plus jitter to avoid thundering-herd retries.
        const backoff = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
        console.warn(
          `Calendar API call failed (attempt ${attempt}/${GoogleCalendarService.MAX_RETRIES}), retrying in ${backoff}ms`
        );
        await sleep(backoff);
      }
    }
  }

  async createCalendarIfNeeded(createNew: boolean): Promise<string> {
    if (createNew) {
      const response = await this.withRetry(() =>
        this.calendar.calendars.insert({
          requestBody: {
            summary: 'Class Schedule',
            description: 'Auto-generated class schedule from CourseSync',
          },
        })
      );
      return response.data.id || 'primary';
    }
    return 'primary';
  }

  async createRecurringEvents(
    events: ClassBlock[],
    semesterStartDate: string,
    semesterEndDate: string,
    timeZone: string,
    calendarId: string
  ): Promise<CreateEventsResult> {
    const eventIds: string[] = [];
    const failures: { title: string; reason: string }[] = [];

    const enabledEvents = events.filter((e) => e.enabled);

    for (let i = 0; i < enabledEvents.length; i++) {
      const event = enabledEvents[i];

      // Throttle between inserts to avoid tripping per-user rate limits.
      if (i > 0) await sleep(GoogleCalendarService.THROTTLE_MS);

      try {
        const eventId = await this.createRecurringEvent(
          event,
          semesterStartDate,
          semesterEndDate,
          timeZone,
          calendarId
        );
        eventIds.push(eventId);
      } catch (error: any) {
        const reason = error?.message || 'Unknown error';
        console.error(`Error creating event for ${event.title}:`, error);
        failures.push({ title: event.title, reason });
        // Continue with other events; failures are reported back to the caller.
      }
    }

    return { eventIds, failures };
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

    const response = await this.withRetry(() =>
      this.calendar.events.insert({
        calendarId,
        requestBody,
      })
    );

    return response.data.id || '';
  }
}

