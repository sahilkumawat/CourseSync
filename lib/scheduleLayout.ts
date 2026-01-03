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
    const timePattern = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i;
    const timeLabels: TimeLabel[] = [];

    for (const box of boxes) {
      const text = box.text.trim();
      const match = text.match(timePattern);
      if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2] || '0', 10);
        const period = match[3].toLowerCase();

        if (period === 'pm' && hours !== 12) {
          hours += 12;
        } else if (period === 'am' && hours === 12) {
          hours = 0;
        }

        const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        timeLabels.push({
          text,
          time: timeString,
          y: box.y,
        });
      }
    }

    return timeLabels.sort((a, b) => a.y - b.y);
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
    const minutes = labels.map(l => this.timeToMinutes(l.time));
  
    return (y: number) => {
      if (labels.length === 0) return '09:00';
  
      // If above the first label, treat as 30 minutes before it
      if (y <= labels[0].y) {
        return this.minutesToTime(minutes[0] - 30);
      }
  
      // If below the last label, treat as 30 minutes after it
      if (y >= labels[labels.length - 1].y) {
        return this.minutesToTime(minutes[minutes.length - 1] + 30);
      }
  
      // Find the two labels that bound this y
      let lowerIndex = 0;
      for (let i = 0; i < labels.length - 1; i++) {
        if (y >= labels[i].y && y <= labels[i + 1].y) {
          lowerIndex = i;
          break;
        }
      }
  
      const lower = labels[lowerIndex];
      const upper = labels[lowerIndex + 1];
      const y0 = lower.y;
      const y1 = upper.y;
      const t0 = minutes[lowerIndex];
      const t1 = minutes[lowerIndex + 1];
  
      const ratio = (y - y0) / (y1 - y0);
      // Linear interpolation (like before) …
      let interpolated = t0 + ratio * (t1 - t0);
      // … then shift everything by +30 minutes, because labels are at
      // the center of the hour slot, not the boundary
      interpolated += 30;
  
      return this.minutesToTime(interpolated);
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
    _slotHeight: number  // no longer needed, but kept for signature compatibility
  ): ClassBlock | null {
    if (cluster.length === 0) return null;
  
    // Sort by y (top → bottom)
    cluster.sort((a, b) => a.y - b.y);
  
    // Day = column of the first box
    const centerX = cluster[0].x + cluster[0].width / 2;
    const dayOfWeek = xToDay(centerX);
    if (!dayOfWeek) return null;
  
    // Bounding box of the whole class block
    const topY = Math.min(...cluster.map((b) => b.y));
    const bottomY = Math.max(...cluster.map((b) => b.y + b.height));
  
    // Map Y → time using your yToTime (which already accounts for label position)
    const rawStartTime = yToTime(topY);
    const rawEndTime = yToTime(bottomY);
  
    // Add a bit of padding on the end so rounding doesn’t clip the class short
    const paddedEnd = this.addMinutes(rawEndTime, 10);
  
    // Snap to half-hours
    const startTime = this.roundTimeDownToHalfHour(rawStartTime);
    const endTime = this.roundTimeUpToHalfHour(paddedEnd);

    // Parse text lines - combine text from boxes, sorted by Y position, then X position
    const sortedBoxes = [...cluster].sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) < 20) {
        // If Y positions are close (same line), sort by X
        return a.x - b.x;
      }
      return yDiff;
    });
    
    const lines: string[] = [];
    let currentLine = '';
    let currentLineY = -1;
    const LINE_HEIGHT_THRESHOLD = 25; // pixels
    
    for (const box of sortedBoxes) {
      const text = box.text.trim();
      if (text.length === 0) continue;
      
      if (currentLineY < 0 || Math.abs(box.y - currentLineY) > LINE_HEIGHT_THRESHOLD) {
        // New line
        if (currentLine) {
          lines.push(currentLine.trim());
        }
        currentLine = text;
        currentLineY = box.y;
      } else {
        // Same line, append with space
        currentLine += (currentLine ? ' ' : '') + text;
      }
    }
    if (currentLine) {
      lines.push(currentLine.trim());
    }
    
    if (lines.length === 0) return null;

    // Combine course name parts (e.g., "Computer Science-186" might be split)
    // Look for course patterns and combine adjacent lines that look like course names
    let titleParts: string[] = [];
    let titleEndIndex = 0;
    
    const coursePattern = /(science|math|engineering|computer|chemistry|physics|biology|mathematics)/i;
    const numberPattern = /^\d+$/;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (coursePattern.test(line) || numberPattern.test(line) || line.includes('-')) {
        titleParts.push(line);
        titleEndIndex = i + 1;
      } else {
        break;
      }
    }
    
    // If we found course name parts, combine them
    let title = titleParts.length > 0 
      ? titleParts.join(' ').replace(/\s+-\s+|\s+-|-\s+/g, '-').replace(/\s+/g, ' ')
      : lines[0] || 'Untitled';
    
    // Clean up title (remove extra spaces, normalize hyphens)
    title = title.replace(/\s+/g, ' ').trim();
    
    // Location is the first line after title that looks like a location
    let location = '';
    let instructorStartIndex = titleEndIndex;
    
    const locationPattern = /^[A-Za-z]+\s+\d+$/; // e.g., "Soda 306"
    for (let i = titleEndIndex; i < lines.length; i++) {
      if (locationPattern.test(lines[i])) {
        location = lines[i];
        instructorStartIndex = i + 1;
        break;
      }
      // Also check for lines that are just numbers (room numbers)
      if (lines[i].match(/^\d{3,}$/)) {
        // Might be a room number, check if previous line was a building name
        if (i > titleEndIndex && /^[A-Za-z]+$/.test(lines[i - 1])) {
          location = `${lines[i - 1]} ${lines[i]}`;
          instructorStartIndex = i + 1;
          break;
        }
      }
    }
    
    // If no location pattern found, use the next line after title as location
    if (!location && lines.length > titleEndIndex) {
      location = lines[titleEndIndex];
      instructorStartIndex = titleEndIndex + 1;
    }

    // Everything after location is instructors
    const instructors = lines.slice(instructorStartIndex)
      .filter(l => l.length > 0)
      .join(', ')
      .trim() || undefined;

    // Validate we have a title (minimum requirement)
    if (title.length < 1) return null;
    
    // Location and instructors are optional - allow classes with just a title

    return {
      id: `${dayOfWeek}-${startTime}-${Math.random().toString(36).substr(2, 9)}`,
      title,
      location: location && location.length > 0 ? location : '',
      instructors: instructors && instructors.length > 0 ? instructors : undefined,
      dayOfWeek,
      startTime,
      endTime,
      enabled: true,
      // Color will be assigned later
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

