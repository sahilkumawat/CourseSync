// returned by OCR service
export interface OcrTextBox {
  text: string;
  x: number;  // top-left
  y: number;
  width: number;
  height: number;
}

// internal representation of one meeting block on the grid
export interface ClassBlock {
  id: string;
  title: string;        // "Computer Science 186"
  location: string;     // "Soda 306"
  instructors?: string; // "Natacha Crooks, Alvin Cheung"
  dayOfWeek: "MO" | "TU" | "WE" | "TH" | "FR";
  startTime: string;    // "10:00"
  endTime: string;      // "11:30"
  enabled: boolean;     // for review screen
  colorId?: string;     // Google Calendar color ID
}

// payload to /api/calendar/sync
export interface CalendarSyncPayload {
  semesterStartDate: string; // "2026-01-20"
  semesterEndDate: string;   // "2026-05-15"
  timeZone: string;          // "America/Los_Angeles"
  events: ClassBlock[];
  createNewCalendar: boolean;
}

// time label detected from OCR
export interface TimeLabel {
  text: string;
  time: string;  // normalized "08:00"
  y: number;
}

// day header detected from OCR
export interface DayHeader {
  text: string;
  day: "MO" | "TU" | "WE" | "TH" | "FR";
  x: number;
}

