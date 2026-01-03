'use client';

import type { ClassBlock } from '@/lib/types';
import ColorPicker from './ColorPicker';

interface ClassTableProps {
  classes: ClassBlock[];
  onChange: (id: string, updates: Partial<ClassBlock>) => void;
}

const DAY_OPTIONS: Array<{ value: ClassBlock['dayOfWeek']; label: string }> = [
  { value: 'MO', label: 'Monday' },
  { value: 'TU', label: 'Tuesday' },
  { value: 'WE', label: 'Wednesday' },
  { value: 'TH', label: 'Thursday' },
  { value: 'FR', label: 'Friday' },
];

// Google Calendar color IDs and their approximate colors
const COLOR_OPTIONS: Array<{ value: string; label: string; color: string }> = [
  { value: '1', label: 'Lavender', color: '#7986cb' },
  { value: '2', label: 'Sage', color: '#33b679' },
  { value: '3', label: 'Grape', color: '#8e24aa' },
  { value: '4', label: 'Flamingo', color: '#e67c73' },
  { value: '5', label: 'Banana', color: '#f6bf26' },
  { value: '6', label: 'Tangerine', color: '#f4511e' },
  { value: '7', label: 'Peacock', color: '#039be5' },
  { value: '8', label: 'Graphite', color: '#616161' },
  { value: '9', label: 'Blueberry', color: '#3f51b5' },
  { value: '10', label: 'Basil', color: '#0b8043' },
  { value: '11', label: 'Tomato', color: '#d50000' },
];

export default function ClassTable({ classes, onChange }: ClassTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Enable
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Title
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Location
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Day
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Start Time
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              End Time
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Instructors
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Color
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {classes.map((classItem) => (
            <tr key={classItem.id}>
              <td className="px-6 py-4 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={classItem.enabled}
                  onChange={(e) =>
                    onChange(classItem.id, { enabled: e.target.checked })
                  }
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <input
                  type="text"
                  value={classItem.title}
                  onChange={(e) => onChange(classItem.id, { title: e.target.value })}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <input
                  type="text"
                  value={classItem.location}
                  onChange={(e) => onChange(classItem.id, { location: e.target.value })}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <select
                  value={classItem.dayOfWeek}
                  onChange={(e) =>
                    onChange(classItem.id, { dayOfWeek: e.target.value as ClassBlock['dayOfWeek'] })
                  }
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  {DAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <input
                  type="time"
                  value={classItem.startTime}
                  onChange={(e) => onChange(classItem.id, { startTime: e.target.value })}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <input
                  type="time"
                  value={classItem.endTime}
                  onChange={(e) => onChange(classItem.id, { endTime: e.target.value })}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </td>
              <td className="px-6 py-4">
                <input
                  type="text"
                  value={classItem.instructors || ''}
                  onChange={(e) => onChange(classItem.id, { instructors: e.target.value })}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="Optional"
                />
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <ColorPicker
                  value={classItem.colorId || '1'}
                  onChange={(colorId) => onChange(classItem.id, { colorId })}
                  colors={COLOR_OPTIONS}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

