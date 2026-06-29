import type { OcrTextBox, ClassBlock, TimeLabel, DayHeader } from './types';
import type { BlockRegion } from './blockDetection';

export class ScheduleLayoutService {
  // Minutes of clock time per vertical pixel, calibrated from the time labels
  // in buildLayout. Lets geometry (px) be converted into durations (minutes).
  private minutesPerPixel = 0;

  private static readonly DAY_MAP: Record<string, "MO" | "TU" | "WE" | "TH" | "FR"> = {
    'monday': 'MO',
    'mon': 'MO',
    'tuesday': 'TU',
    'tue': 'TU',
    'tues': 'TU',
    'wednesday': 'WE',
    'wed': 'WE',
    'thursday': 'TH',
    'thu': 'TH',
    'thur': 'TH',
    'thurs': 'TH',
    'friday': 'FR',
    'fri': 'FR',
  };

  buildLayout(boxes: OcrTextBox[]): { classBlocks: ClassBlock[] } {
    const timeLabels = this.detectTimeLabels(boxes);
    const dayHeaders = this.detectDayHeaders(boxes);

    if (timeLabels.length === 0 || dayHeaders.length === 0) {
      return { classBlocks: [] };
    }

    const slotHeight = this.computeSlotHeight(timeLabels);
    // Minutes represented by one pixel of vertical travel, derived from the
    // label spacing. Used to convert the px slot height into a clock duration.
    this.minutesPerPixel = this.computeMinutesPerPixel(timeLabels);
    const yToTime = this.buildYToTimeMap(timeLabels);
    const xToDay = this.buildXToDayMap(dayHeaders);

    // Find the schedule grid area (below day headers, to the right of time labels)
    // Find the rightmost edge of time labels
    const timeLabelBoxes = boxes.filter(b => {
      const text = b.text.trim();
      return /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.test(text);
    });
    const minTimeX = timeLabelBoxes.length > 0 
      ? Math.max(...timeLabelBoxes.map(b => b.x + b.width))
      : 0;
    
    // Find the bottom edge of day headers
    const dayHeaderBoxes = boxes.filter(b => {
      const text = b.text.trim().toLowerCase();
      return ScheduleLayoutService.DAY_MAP[text] !== undefined;
    });
    const maxHeaderY = dayHeaderBoxes.length > 0
      ? Math.max(...dayHeaderBoxes.map(b => b.y + b.height))
      : 0;

    // Filter out time labels, day headers, and header/navigation text
    const eventCandidates = boxes.filter((b) => {
      const text = b.text.trim().toLowerCase();
      
      // Filter out time labels
      if (this.isTimeLabel(b, timeLabels)) return false;
      
      // Filter out day headers
      if (this.isDayHeader(b, dayHeaders)) return false;
      
      // Filter out common header/navigation words
      const headerWords = ['schedule', 'planner', 'help', 'sign', 'out'];
      if (headerWords.some(word => text === word || text.includes(word))) return false;
      
      // Filter out boxes that are likely in the header area (above day headers)
      if (b.y < maxHeaderY) return false;
      
      // Filter out boxes that are in the time column (left of schedule grid)
      if (b.x < minTimeX) return false;
      
      // Filter out very short text (likely noise)
      if (text.length < 2) return false;
      
      return true;
    });

    const clusters = this.clusterEventBoxes(eventCandidates, xToDay, slotHeight);
    const classBlocks = clusters
      .map((cluster) => this.toClassBlock(cluster, xToDay, yToTime, slotHeight))
      .filter((block): block is ClassBlock => {
        if (!block) return false;
        // Filter out blocks that don't look like valid classes
        // Must have a title with some content
        if (!block.title || block.title.length < 1) return false;
        // Title should not be just a time
        if (/^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(block.title)) return false;
        // Location and instructors are optional - allow classes with just a title
        return true;
      });

    // Assign colors to classes based on title (same title = same color)
    this.assignColors(classBlocks);

    return { classBlocks };
  }

  /**
   * Preferred parsing path: use the detected colored block rectangles to define
   * each class's exact bounds, then assign OCR text to whichever block it falls
   * inside. This sidesteps the two hardest text-only problems — separating
   * stacked classes in one column, and recovering end times from text that
   * underfills its block.
   *
   * Returns an empty result if there aren't enough axis labels or regions; the
   * caller can fall back to the text-clustering buildLayout().
   */
  buildLayoutFromRegions(
    boxes: OcrTextBox[],
    regions: BlockRegion[]
  ): { classBlocks: ClassBlock[] } {
    const timeLabels = this.detectTimeLabels(boxes);
    const dayHeaders = this.detectDayHeaders(boxes);

    if (timeLabels.length < 2 || dayHeaders.length === 0 || regions.length === 0) {
      return { classBlocks: [] };
    }

    const yToTime = this.buildYToTimeMap(timeLabels);
    const xToDay = this.buildXToDayMap(dayHeaders);

    const timeLabelKeys = new Set(timeLabels.map((t) => t.y));
    const classBlocks: ClassBlock[] = [];

    for (const region of regions) {
      const day = xToDay(region.x + region.width / 2);
      if (!day) continue;

      // Exact bounds → start from the top, duration from the true block height.
      const startTime = this.roundTimeToHalfHour(yToTime(region.y));
      const rawEnd = yToTime(region.y + region.height);
      const rawDuration = this.timeToMinutes(rawEnd) - this.timeToMinutes(startTime);
      const duration = this.snapDuration(rawDuration);
      const endTime = this.minutesToTime(this.timeToMinutes(startTime) + duration);

      // Assign text whose center falls inside this region (with a small margin).
      const margin = 6;
      const inside = boxes.filter((b) => {
        if (timeLabelKeys.has(b.y + b.height / 2)) return false;
        if (this.isDayHeader(b, dayHeaders)) return false;
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        return (
          cx >= region.x - margin &&
          cx <= region.x + region.width + margin &&
          cy >= region.y - margin &&
          cy <= region.y + region.height + margin
        );
      });
      if (inside.length === 0) continue;

      const parsed = this.parseTextLines(inside);
      if (!parsed || !parsed.title || /^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(parsed.title)) {
        continue;
      }

      classBlocks.push({
        id: `${day}-${startTime}-${Math.random().toString(36).substr(2, 9)}`,
        title: parsed.title,
        location: parsed.location,
        instructors: parsed.instructors,
        dayOfWeek: day,
        startTime,
        endTime,
        enabled: true,
      });
    }

    this.assignColors(classBlocks);
    return { classBlocks };
  }

  // Snap a raw duration (minutes) to the nearest 30-minute increment, with a
  // 60-minute minimum. Matches the convention that classes are 60/90/120/...
  private snapDuration(rawMinutes: number): number {
    const snapped = Math.round(rawMinutes / 30) * 30;
    return Math.max(60, snapped);
  }

  private detectTimeLabels(boxes: OcrTextBox[]): TimeLabel[] {
    // A time-axis label must carry an explicit am/pm. Requiring the suffix is
    // what separates a real label ("10am") from a stray room number or count
    // ("10") that would otherwise corrupt the y->time fit.
    //  - 9am, 10pm, 9:15am, 12:30pm
    const pattern = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i;

    // Work top-to-bottom (smaller y = earlier time on the grid).
    const sorted = [...boxes].sort((a, b) => a.y - b.y);

    const out: TimeLabel[] = [];

    for (const box of sorted) {
      const raw = box.text.trim().toLowerCase();
      const m = raw.match(pattern);
      if (!m) continue;

      const h = parseInt(m[1], 10);
      const min = parseInt(m[2] ?? "0", 10);
      const period = m[3].toLowerCase() as "am" | "pm";

      // Filter out junk like "13am" that OCR might produce.
      if (h < 1 || h > 12) continue;
      if (min < 0 || min >= 60) continue;

      // Convert to 24h time. 12am -> 00, 12pm -> 12.
      let hh = h % 12;
      if (period === "pm") hh += 12;

      const timeString = `${String(hh).padStart(2, "0")}:${String(min).padStart(2, "0")}`;

      out.push({
        text: box.text.trim(),
        time: timeString,
        y: box.y + box.height / 2,
      });
    }

    // Deduplicate times that may appear twice due to OCR; keep the top-most.
    const seenTime = new Set<string>();
    const deduped: TimeLabel[] = [];
    for (const t of out.sort((a, b) => a.y - b.y)) {
      if (seenTime.has(t.time)) continue;
      seenTime.add(t.time);
      deduped.push(t);
    }

    // Monotonicity guard: as y increases the time must increase. A label that
    // goes backwards is a misread (e.g. "3pm" OCR'd in the morning band) and
    // would otherwise skew the least-squares fit for every class. Drop it.
    const monotonic: TimeLabel[] = [];
    for (const t of deduped) {
      const prev = monotonic[monotonic.length - 1];
      if (prev && this.timeToMinutes(t.time) <= this.timeToMinutes(prev.time)) {
        continue;
      }
      monotonic.push(t);
    }
    return monotonic;
  }
  

  private detectDayHeaders(boxes: OcrTextBox[]): DayHeader[] {
    const dayHeaders: DayHeader[] = [];

    for (const box of boxes) {
    const text = box.text.trim().toLowerCase();
    const day = ScheduleLayoutService.DAY_MAP[text];
    if (day) {
        dayHeaders.push({
          text: box.text.trim(),
          day,
          x: box.x + box.width / 2, // use center x
        });
      }
    }

    return dayHeaders.sort((a, b) => a.x - b.x);
  }

  private buildYToTimeMap(timeLabels: TimeLabel[]): (y: number) => string {
    const labels = [...timeLabels].sort((a, b) => a.y - b.y);
    if (labels.length < 2) {
      const fallback = labels[0]?.time ?? "09:00";
      return () => fallback;
    }

    const ys = labels.map((l) => l.y);
    const ts = labels.map((l) => this.timeToMinutes(l.time));

    // Piecewise-linear interpolation between the two surrounding labels. Unlike
    // a single global least-squares line, this keeps each query local, so one
    // mis-spaced or misdetected label (e.g. an irregular last row) can't skew
    // the mapping for the rest of the grid.
    const interp = (y: number, i: number, j: number): number => {
      const span = ys[j] - ys[i];
      if (span === 0) return ts[i];
      const frac = (y - ys[i]) / span;
      return ts[i] + frac * (ts[j] - ts[i]);
    };

    return (y: number) => {
      let minutes: number;
      if (y <= ys[0]) {
        minutes = interp(y, 0, 1); // extrapolate above the first label
      } else if (y >= ys[ys.length - 1]) {
        minutes = interp(y, ys.length - 2, ys.length - 1); // extrapolate below the last
      } else {
        // Find the bracketing pair.
        let hi = 1;
        while (hi < ys.length - 1 && ys[hi] < y) hi++;
        minutes = interp(y, hi - 1, hi);
      }
      return this.minutesToTime(minutes);
    };
  }

  

  private computeSlotHeight(timeLabels: TimeLabel[]): number {
    if (timeLabels.length < 2) return 0;

    const diffs: number[] = [];
    for (let i = 0; i < timeLabels.length - 1; i++) {
      diffs.push(timeLabels[i + 1].y - timeLabels[i].y);
    }

    const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    return avg;
  }

  // Derive minutes-per-pixel from the time labels: total minutes spanned
  // divided by total pixels spanned. Robust to 30- vs 60-minute grid rows.
  private computeMinutesPerPixel(timeLabels: TimeLabel[]): number {
    if (timeLabels.length < 2) return 0;
    const sorted = [...timeLabels].sort((a, b) => a.y - b.y);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const pixelSpan = last.y - first.y;
    if (pixelSpan <= 0) return 0;
    const minuteSpan = this.timeToMinutes(last.time) - this.timeToMinutes(first.time);
    return minuteSpan / pixelSpan;
  }

  // Convert a pixel slot height into its clock-time equivalent in minutes.
  private slotHeightToMinutes(slotHeight: number): number {
    if (slotHeight <= 0 || this.minutesPerPixel <= 0) return 0;
    return slotHeight * this.minutesPerPixel;
  }

  private buildXToDayMap(dayHeaders: DayHeader[]): (x: number) => "MO" | "TU" | "WE" | "TH" | "FR" | null {
    return (x: number) => {
      if (dayHeaders.length === 0) return null;

      // Find the day header with the closest x position
      let closest = dayHeaders[0];
      let minDistance = Math.abs(x - closest.x);

      for (const header of dayHeaders) {
        const distance = Math.abs(x - header.x);
        if (distance < minDistance) {
          minDistance = distance;
          closest = header;
        }
      }

      // Check if we're within a reasonable threshold (half the distance to next header)
      const headerIndex = dayHeaders.indexOf(closest);
      let threshold = Infinity;

      if (headerIndex > 0) {
        threshold = Math.min(threshold, (closest.x - dayHeaders[headerIndex - 1].x) / 2);
      }
      if (headerIndex < dayHeaders.length - 1) {
        threshold = Math.min(threshold, (dayHeaders[headerIndex + 1].x - closest.x) / 2);
      }

      if (minDistance <= threshold * 1.5) {
        return closest.day;
      }

      return null;
    };
  }

  private isTimeLabel(box: OcrTextBox, timeLabels: TimeLabel[]): boolean {
    const timePattern = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i;
    return timePattern.test(box.text.trim());
  }

  private isDayHeader(box: OcrTextBox, dayHeaders: DayHeader[]): boolean {
    const text = box.text.trim().toLowerCase();
    return ScheduleLayoutService.DAY_MAP[text] !== undefined;
  }

  private clusterEventBoxes(
    boxes: OcrTextBox[],
    xToDay: (x: number) => "MO" | "TU" | "WE" | "TH" | "FR" | null,
    slotHeight: number
  ): OcrTextBox[][] {
    const clusters: OcrTextBox[][] = [];
    const used = new Set<number>();

    // Scale the vertical merge gap to the grid: lines within one slot belong to
    // the same class, but two slots apart is a different class. Cap it below a
    // full slot so adjacent back-to-back classes don't merge. Fall back to the
    // original 80px when slot height is unknown. Horizontal stays resolution-ish.
    const verticalGap = slotHeight > 0 ? Math.min(slotHeight * 0.6, 120) : 80;
    const horizontalGap = slotHeight > 0 ? Math.min(slotHeight * 0.5, 60) : 50;

    // First, group boxes by day column to make clustering more efficient
    const boxesByDay: Record<string, OcrTextBox[]> = {};
    for (const box of boxes) {
      const day = xToDay(box.x + box.width / 2);
      if (!day) continue;
      if (!boxesByDay[day]) boxesByDay[day] = [];
      boxesByDay[day].push(box);
    }

    // Cluster boxes within each day
    for (const day in boxesByDay) {
      const dayBoxes = boxesByDay[day];
      const dayUsed = new Set<OcrTextBox>();

      for (const seedBox of dayBoxes) {
        if (dayUsed.has(seedBox)) continue;

        const cluster: OcrTextBox[] = [seedBox];
        dayUsed.add(seedBox);

        // Create bounding box for this cluster
        let clusterLeft = seedBox.x;
        let clusterRight = seedBox.x + seedBox.width;
        let clusterTop = seedBox.y;
        let clusterBottom = seedBox.y + seedBox.height;

        // Iteratively expand cluster by finding nearby boxes
        let changed = true;
        while (changed) {
          changed = false;
          for (const box of dayBoxes) {
            if (dayUsed.has(box)) continue;

            const boxRight = box.x + box.width;
            const boxBottom = box.y + box.height;

            // Check if box overlaps or is very close to cluster bounding box
            const horizontalOverlap = !(box.x > clusterRight + horizontalGap || boxRight < clusterLeft - horizontalGap);
            const verticalOverlap = !(box.y > clusterBottom + verticalGap || boxBottom < clusterTop - verticalGap);

            if (horizontalOverlap && verticalOverlap) {
              cluster.push(box);
              dayUsed.add(box);
              changed = true;
              // Expand cluster bounding box
              clusterLeft = Math.min(clusterLeft, box.x);
              clusterRight = Math.max(clusterRight, boxRight);
              clusterTop = Math.min(clusterTop, box.y);
              clusterBottom = Math.max(clusterBottom, boxBottom);
            }
          }
        }

        // Only keep clusters with multiple boxes or substantial single boxes
        if (cluster.length >= 2 || (cluster.length === 1 && cluster[0].text.trim().length > 8)) {
          clusters.push(cluster);
        }
      }
    }

    return clusters;
  }

  private toClassBlock(
    cluster: OcrTextBox[],
    xToDay: (x: number) => "MO" | "TU" | "WE" | "TH" | "FR" | null,
    yToTime: (y: number) => string,
    slotHeight: number
  ): ClassBlock | null {
    if (cluster.length === 0) return null;

    // Sort by y (top → bottom)
    cluster.sort((a, b) => a.y - b.y);

    // Day = column of the first box
    const centerX = cluster[0].x + cluster[0].width / 2;
    const dayOfWeek = xToDay(centerX);
    if (!dayOfWeek) return null;

    // ---------- TIME BOUNDS ----------
    // Convert pixel positions to clock times using the calibrated y->time fit.
    // The block's top text aligns with its start; its bottom text sits near the
    // bottom of the block, so both map through the same fit — no magic padding.
    const topYText = Math.min(...cluster.map((b) => b.y));
    const bottomYText = Math.max(...cluster.map((b) => b.y + b.height));

    const rawStart = yToTime(topYText);
    const startTime = this.roundTimeToHalfHour(rawStart);

    const rawEnd = yToTime(bottomYText);
    let endTime = this.roundTimeToHalfHour(rawEnd);

    // Guarantee a sane minimum duration. If text fills only part of the block
    // (e.g. a one-line class) the bottom-text time can round back onto the
    // start; floor the duration to one grid slot (or 60 min if unknown).
    const slotMinutes = this.slotHeightToMinutes(slotHeight);
    const minDuration = slotMinutes > 0 ? slotMinutes : 60;
    if (this.timeToMinutes(endTime) - this.timeToMinutes(startTime) < minDuration) {
      endTime = this.roundTimeToHalfHour(this.addMinutes(startTime, minDuration));
    }

    // ---------- TEXT PARSING ----------
    const parsed = this.parseTextLines(cluster);
    if (!parsed) return null;

    return {
      id: `${dayOfWeek}-${startTime}-${Math.random().toString(36).substr(2, 9)}`,
      title: parsed.title,
      location: parsed.location,
      instructors: parsed.instructors,
      dayOfWeek,
      startTime,
      endTime,
      enabled: true,
    };
  }

  /**
   * Group a block's text boxes into lines (top→bottom, left→right within a
   * line) and split them into title / location / instructor.
   *
   * Layout convention on CalCentral blocks:
   *   line(s) 1..   course title          ("Computer Science-164")
   *   middle line(s) building + room       ("The Gateway Building" / "1210")
   *   last line(s)  instructor name(s)     ("Max Willsey")
   */
  private parseTextLines(
    boxes: OcrTextBox[]
  ): { title: string; location: string; instructors?: string } | null {
    const sortedBoxes = [...boxes].sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) < 20) return a.x - b.x;
      return yDiff;
    });

    const lines: string[] = [];
    let currentLine = '';
    let currentLineY = -1;
    const LINE_HEIGHT_THRESHOLD = 25;

    for (const box of sortedBoxes) {
      const text = box.text.trim();
      if (!text) continue;
      if (currentLineY < 0 || Math.abs(box.y - currentLineY) > LINE_HEIGHT_THRESHOLD) {
        if (currentLine) lines.push(currentLine.trim());
        currentLine = text;
        currentLineY = box.y;
      } else {
        currentLine += (currentLine ? ' ' : '') + text;
      }
    }
    if (currentLine) lines.push(currentLine.trim());
    if (lines.length === 0) return null;

    // The first line is always part of the title. The title continues until we
    // hit a line that begins the location.
    const isRoomNumber = (s: string) => /^\d{1,4}[A-Za-z]?$/.test(s);
    // A "room line" ends in a room number: "Etcheverry 3109", "Bldg 115", "1210".
    const isRoomLine = (s: string) =>
      isRoomNumber(s) || /^[A-Za-z][A-Za-z./ ]*\s+\d{1,4}[A-Za-z]?$/.test(s);
    // A building-name line: words only, no trailing number ("Anthro/Art Practice").
    const isBuildingNameLine = (s: string) => /^[A-Za-z][A-Za-z./ ]*$/.test(s);
    const startsLocation = (i: number): boolean => {
      if (i === 0) return false; // first line is always title
      const line = lines[i];
      // Building + room on one line.
      if (isRoomLine(line) && !isRoomNumber(line)) return true;
      // Building-name line immediately followed by a room line (bare number or
      // "Bldg 115") — e.g. "Anthro/Art Practice" then "Bldg 115".
      if (isBuildingNameLine(line) && i + 1 < lines.length && isRoomLine(lines[i + 1])) {
        return true;
      }
      return false;
    };

    let titleEndIndex = 1;
    const maxTitleLines = 3;
    while (titleEndIndex < Math.min(lines.length, maxTitleLines) && !startsLocation(titleEndIndex)) {
      titleEndIndex++;
    }

    const title = lines
      .slice(0, titleEndIndex)
      .join(' ')
      .replace(/\s+-\s+|\s+-|-\s+/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    if (title.length < 1) return null;

    // Location: consume the location line, plus a trailing room line when the
    // building name stood on its own line ("Anthro/Art Practice" + "Bldg 115").
    let location = '';
    let instructorStartIndex = titleEndIndex;
    if (titleEndIndex < lines.length) {
      const first = lines[titleEndIndex];
      const next = lines[titleEndIndex + 1] ?? '';
      if (isBuildingNameLine(first) && isRoomLine(next)) {
        location = `${first} ${next}`;
        instructorStartIndex = titleEndIndex + 2;
      } else {
        location = first;
        instructorStartIndex = titleEndIndex + 1;
      }
    }

    const instructors =
      lines.slice(instructorStartIndex).filter((l) => l.length > 0).join(', ').trim() || undefined;

    return {
      title,
      location: location && location.length > 0 ? location : '',
      instructors,
    };
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  private addMinutes(time: string, minutesToAdd: number): string {
    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + minutesToAdd;
    const newHours = Math.floor(totalMinutes / 60) % 24;
    const newMins = totalMinutes % 60;
    return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
  }

  private roundTimeToHalfHour(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    // Round to nearest 30 minutes (0 or 30)
    const roundedMinutes = Math.round(totalMinutes / 30) * 30;
    const roundedHours = Math.floor(roundedMinutes / 60) % 24;
    const roundedMins = roundedMinutes % 60;
    return `${roundedHours.toString().padStart(2, '0')}:${roundedMins.toString().padStart(2, '0')}`;
  }

  private roundTimeDownToHalfHour(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    // Round down to nearest 30 minutes (0 or 30)
    const roundedMinutes = Math.floor(totalMinutes / 30) * 30;
    const roundedHours = Math.floor(roundedMinutes / 60) % 24;
    const roundedMins = roundedMinutes % 60;
    return `${roundedHours.toString().padStart(2, '0')}:${roundedMins.toString().padStart(2, '0')}`;
  }

  private roundTimeUpToHalfHour(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    // Round up to nearest 30 minutes (0 or 30)
    const roundedMinutes = Math.ceil(totalMinutes / 30) * 30;
    const roundedHours = Math.floor(roundedMinutes / 60) % 24;
    const roundedMins = roundedMinutes % 60;
    return `${roundedHours.toString().padStart(2, '0')}:${roundedMins.toString().padStart(2, '0')}`;
  }

  private assignColors(classBlocks: ClassBlock[]): void {
    // Google Calendar color IDs (1-11, excluding some)
    const colorIds = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
    
    // Group classes by normalized title (same course = same color)
    const titleToColor = new Map<string, string>();
    let colorIndex = 0;
    
    for (const block of classBlocks) {
      // Normalize title for grouping (remove extra spaces, lowercase for comparison)
      const normalizedTitle = block.title
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
      
      if (!titleToColor.has(normalizedTitle)) {
        titleToColor.set(normalizedTitle, colorIds[colorIndex % colorIds.length]);
        colorIndex++;
      }
      
      block.colorId = titleToColor.get(normalizedTitle);
    }
  }
}

