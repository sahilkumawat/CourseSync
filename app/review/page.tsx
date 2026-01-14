'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import ClassTable from '@/components/ClassTable';
import type { ClassBlock, CalendarSyncPayload } from '@/lib/types';

const TIMEZONES = [
  { value: 'America/Los_Angeles', label: 'Pacific Time (Los Angeles)' },
  { value: 'America/Denver', label: 'Mountain Time (Denver)' },
  { value: 'America/Chicago', label: 'Central Time (Chicago)' },
  { value: 'America/New_York', label: 'Eastern Time (New York)' },
];

export default function ReviewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [classes, setClasses] = useState<ClassBlock[]>([]);
  const [semesterStartDate, setSemesterStartDate] = useState('2026-01-20');
  const [semesterEndDate, setSemesterEndDate] = useState('2026-05-18');
  const [timeZone, setTimeZone] = useState('America/Los_Angeles');
  const [createNewCalendar, setCreateNewCalendar] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorUrl, setErrorUrl] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [hasSynced, setHasSynced] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/');
      return;
    }

    // Check if we've already synced (prevents redirect after sync)
    const syncedFlag = sessionStorage.getItem('hasSynced');
    if (syncedFlag === 'true') {
      setHasSynced(true);
      // Try to load classes from sessionStorage if available
      const stored = sessionStorage.getItem('parsedClasses');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setClasses(parsed);
        } catch (err) {
          // Ignore parse errors if we've already synced
        }
      }
      return;
    }

    // Load parsed classes from sessionStorage
    const stored = sessionStorage.getItem('parsedClasses');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setClasses(parsed);
      } catch (err) {
        setError('Failed to load parsed classes');
      }
    } else {
      router.push('/upload');
    }
  }, [session, status, router]);

  const handleClassChange = (id: string, updates: Partial<ClassBlock>) => {
    setClasses((prev) =>
      prev.map((cls) => (cls.id === id ? { ...cls, ...updates } : cls))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setErrorUrl(null);
    setSuccess(false);

    try {
      const payload: CalendarSyncPayload = {
        semesterStartDate,
        semesterEndDate,
        timeZone,
        events: classes.filter((c) => c.enabled),
        createNewCalendar,
      };

      const response = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        setErrorUrl(data.enableUrl || null);
        const errorMessage = data.error || 'Failed to sync to Google Calendar';
        const errorDetails = data.details ? `\n\n${data.details}` : '';
        throw new Error(errorMessage + errorDetails);
      }

      const data = await response.json();
      setSuccess(true);
      setCalendarId(data.calendarId || null);
      setHasSynced(true);
      // Mark as synced but keep classes for display
      sessionStorage.setItem('hasSynced', 'true');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <>
        <NavBar />
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </>
    );
  }

  if (!session) {
    return null;
  }

  // Allow rendering even if classes are empty if we've already synced
  if (classes.length === 0 && !hasSynced) {
    return null;
  }

  return (
    <>
      <NavBar />
      <div className="max-w-7xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Review & Sync</h1>

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-800 mb-3">
              Successfully synced {classes.filter((c) => c.enabled).length} events to Google Calendar!
            </p>
            <a
              href="https://calendar.google.com/calendar/r"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              Open Google Calendar
            </a>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800 whitespace-pre-line">{error}</p>
            {errorUrl && (
              <a
                href={errorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
              >
                Enable Google Calendar API
              </a>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Semester Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="startDate"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Semester Start Date
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={semesterStartDate}
                  onChange={(e) => setSemesterStartDate(e.target.value)}
                  required
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="endDate"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Semester End Date
                </label>
                <input
                  type="date"
                  id="endDate"
                  value={semesterEndDate}
                  onChange={(e) => setSemesterEndDate(e.target.value)}
                  required
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="timeZone"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Time Zone
                </label>
                <select
                  id="timeZone"
                  value={timeZone}
                  onChange={(e) => setTimeZone(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Classes ({classes.length})
            </h2>
            <ClassTable classes={classes} onChange={handleClassChange} />
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                id="createNewCalendar"
                checked={createNewCalendar}
                onChange={(e) => setCreateNewCalendar(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label
                htmlFor="createNewCalendar"
                className="ml-2 block text-sm text-gray-900"
              >
                Create new calendar named &quot;Class Schedule&quot;
              </label>
            </div>
            <button
              type="submit"
              disabled={isSubmitting || classes.filter((c) => c.enabled).length === 0}
              className="w-full md:w-auto px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Syncing...' : 'Sync to Google Calendar'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

