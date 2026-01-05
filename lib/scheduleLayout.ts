import type { OcrTextBox, ClassBlock, TimeLabel, DayHeader } from './types';

export class ScheduleLayoutService {
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

    const clusters = this.clusterEventBoxes(eventCandidates, xToDay);
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

  private detectTimeLabels(boxes: OcrTextBox[]): TimeLabel[] {
    // Matches:
    //  - 9am, 10pm
    //  - 9:15am, 12:30pm
    //  - 9:15, 11:30 (no am/pm)
    const pattern = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;
  
    // Work top-to-bottom so we can “inherit” am/pm for labels like 9:15
    const sorted = [...boxes].sort((a, b) => a.y - b.y);
  
    let currentPeriod: "am" | "pm" | null = null;
    const out: TimeLabel[] = [];
  
    for (const box of sorted) {
      const raw = box.text.trim().toLowerCase();
      const m = raw.match(pattern);
      if (!m) continue;
  
      let h = parseInt(m[1], 10);
      const min = parseInt(m[2] ?? "0", 10);
      const period = (m[3] as ("am" | "pm" | undefined)) ?? undefined;
  
      // Filter out junk like "1" that OCR might produce
      if (h < 1 || h > 12) continue;
      if (min < 0 || min >= 60) continue;
  
      // If the label explicitly says am/pm, lock it in.
      if (period) currentPeriod = period;
  
      // If no am/pm, inherit from the most recent explicit label.
      // Default to 'am' if we never saw one (works for typical schedules).
      const inferredPeriod = currentPeriod ?? "am";
  
      // Convert to 24h time
      let hh = h % 12;
      if (inferredPeriod === "pm") hh += 12;
  
      // Special-case 12am/12pm handling
      if (inferredPeriod === "am" && h === 12) hh = 0;
      if (inferredPeriod === "pm" && h === 12) hh = 12;
  
      const timeString = `${String(hh).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  
      out.push({
        text: box.text.trim(),
        time: timeString,
        y: box.y + box.height / 2,
      });
    }
  
    // Deduplicate times that may appear twice due to OCR
    // Keep the first occurrence (top-most)
    const seenTime = new Set<string>();
    const deduped: TimeLabel[] = [];
    for (const t of out.sort((a, b) => a.y - b.y)) {
      if (seenTime.has(t.time)) continue;
      seenTime.add(t.time);
      deduped.push(t);
    }
    return deduped;
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
  
    // Fit: minutes = a*y + b  (least squares)
    const ys = labels.map(l => l.y);
    const ts = labels.map(l => this.timeToMinutes(l.time));
  
    const n = ys.length;
    const sumY = ys.reduce((s, v) => s + v, 0);
    const sumT = ts.reduce((s, v) => s + v, 0);
    const sumYY = ys.reduce((s, v) => s + v * v, 0);
    const sumYT = ys.reduce((s, v, i) => s + v * ts[i], 0);
  
    const denom = n * sumYY - sumY * sumY;
    const a = denom === 0 ? 0 : (n * sumYT - sumY * sumT) / denom;
    const b = (sumT - a * sumY) / n;
  
    return (y: number) => {
      const minutes = a * y + b;
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
    xToDay: (x: number) => "MO" | "TU" | "WE" | "TH" | "FR" | null
  ): OcrTextBox[][] {
    const clusters: OcrTextBox[][] = [];
    const used = new Set<number>();

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
            const horizontalOverlap = !(box.x > clusterRight + 50 || boxRight < clusterLeft - 50);
            const verticalOverlap = !(box.y > clusterBottom + 80 || boxBottom < clusterTop - 80);

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
    _slotHeight: number
  ): ClassBlock | null {
    if (cluster.length === 0) return null;
  
    // Sort by y (top → bottom)
    cluster.sort((a, b) => a.y - b.y);
  
    // Day = column of the first box
    const centerX = cluster[0].x + cluster[0].width / 2;
    const dayOfWeek = xToDay(centerX);
    if (!dayOfWeek) return null;
  
    // ---------- TIME BOUNDS ----------
    const topYText = Math.min(...cluster.map((b) => b.y));
    const bottomYText = Math.max(...cluster.map((b) => b.y + b.height));
  
    // Start time = top Y → round to nearest half hour
    const rawStart = yToTime(topYText);
    const startTime = this.roundTimeToHalfHour(rawStart);
  
    // End time = bottom Y + 45 minutes → round to nearest half hour
    // (We add 45 instead of 15 because rounding requires more padding to round up correctly)
    const rawEnd = yToTime(bottomYText);
    const rawEndWithPadding = this.addMinutes(rawEnd, 45);
    const endTime = this.roundTimeToHalfHour(rawEndWithPadding);
  
    // ---------- TEXT PARSING ----------
    const sortedBoxes = [...cluster].sort((a, b) => {
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
  
    // Title detection
    // Take lines until we find something that looks like a location (building + number)
    // or we've taken the first 3 lines (most courses have 1-2 title lines)
    const locationPattern = /^[A-Za-z]+\s+\d+$/; // "Soda 306"
    let titleEndIndex = 0;
    const maxTitleLines = 3;
  
    for (let i = 0; i < Math.min(lines.length, maxTitleLines); i++) {
      const line = lines[i];
      // Stop if we hit something that looks like a location
      if (locationPattern.test(line)) {
        break;
      }
      // Stop if we hit something that's just a number (likely a room number on its own)
      if (i > 0 && /^\d{3,}$/.test(line)) {
        break;
      }
      titleEndIndex = i + 1;
    }
  
    // Get title from lines up to titleEndIndex
    const titleParts = lines.slice(0, titleEndIndex);
    let title =
      titleParts.length > 0
        ? titleParts.join(' ')
            .replace(/\s+-\s+|\s+-|-\s+/g, '-')
            .replace(/\s+/g, ' ')
            .trim()
        : lines[0] || 'Untitled';
  
    title = title.replace(/\s+/g, ' ').trim();
    if (title.length < 1) return null;
  
    // Location
    let location = '';
    let instructorStartIndex = titleEndIndex;
    for (let i = titleEndIndex; i < lines.length; i++) {
      if (locationPattern.test(lines[i])) {
        location = lines[i];
        instructorStartIndex = i + 1;
        break;
      }
      if (/^\d{3,}$/.test(lines[i])) {
        if (i > titleEndIndex && /^[A-Za-z]+$/.test(lines[i - 1])) {
          location = `${lines[i - 1]} ${lines[i]}`;
          instructorStartIndex = i + 1;
          break;
        }
      }
    }
  
    if (!location && lines.length > titleEndIndex) {
      location = lines[titleEndIndex];
      instructorStartIndex = titleEndIndex + 1;
    }
  
    const instructors =
      lines.slice(instructorStartIndex).filter((l) => l.length > 0).join(', ').trim() || undefined;
  
    console.log({
      title,
      topYText,
      bottomYText,
      rawStart,
      rawEndWithPadding,
      startTime,
      endTime,
    });
  
    return {
      id: `${dayOfWeek}-${startTime}-${Math.random().toString(36).substr(2, 9)}`,
      title,
      location: location && location.length > 0 ? location : '',
      instructors: instructors && instructors.length > 0 ? instructors : undefined,
      dayOfWeek,
      startTime,
      endTime,
      enabled: true,
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

