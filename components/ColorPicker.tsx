'use client';

import { useState, useRef, useEffect, useMemo } from 'react';

interface ColorPickerProps {
  value: string;
  onChange: (colorId: string) => void;
  colors: Array<{ value: string; label: string; color: string }>;
}

export default function ColorPicker({ value, onChange, colors }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const selectedColor = useMemo(
    () => colors.find((c) => c.value === value) ?? colors[0],
    [colors, value]
  );

  return (
    <div className="relative inline-block" ref={pickerRef}>
      {/* Trigger (Google-ish pill) */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <span
          className="h-5 w-5 rounded-full border border-gray-300"
          style={{ backgroundColor: selectedColor.color }}
        />
        <span className="max-w-[120px] truncate">{selectedColor.label}</span>
        <svg className="ml-0.5 h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
          <path d="M5.25 7.5 10 12.25 14.75 7.5l1.06 1.06L10 14.37 4.19 8.56 5.25 7.5z" />
        </svg>
      </button>

      {/* Popover (Google palette style) */}
      {isOpen && (
        <div
          className="absolute z-50 mt-2 w-[150px] rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg"
          role="menu"
        >
          <div className="grid grid-cols-6 gap-1.5">
            {colors.map((c) => {
              const selected = c.value === value;

              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => {
                    onChange(c.value);
                    setIsOpen(false);
                  }}
                  className="relative h-4 w-4 rounded-full focus:outline-none"
                  title={c.label}
                  role="menuitem"
                >
                  {/* outer ring (thin gray like Google) */}
                  <span className="absolute inset-0 rounded-full border border-gray-300" />

                  {/* color dot */}
                  <span
                    className="absolute inset-[2px] rounded-full"
                    style={{ backgroundColor: c.color }}
                  />

                  {/* selected: blue ring */}
                  {selected && (
                    <span className="absolute -inset-[1px] rounded-full ring-2 ring-blue-600" />
                  )}

                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
