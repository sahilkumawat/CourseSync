'use client';

import { useState, useRef, useEffect } from 'react';

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

  const selectedColor = colors.find(c => c.value === value) || colors[0];

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <div
          className="w-5 h-5 rounded-full border border-gray-300"
          style={{ backgroundColor: selectedColor.color }}
        />
        <span className="text-sm text-gray-700">{selectedColor.label}</span>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 p-3 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="grid grid-cols-6 gap-3">
            {colors.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() => {
                  onChange(color.value);
                  setIsOpen(false);
                }}
                className={`relative w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center ${
                  value === color.value
                    ? 'border-blue-600'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                style={{ backgroundColor: color.color }}
                title={color.label}
              >
                {value === color.value && (
                  <svg
                    className="w-4 h-4 text-white drop-shadow-md"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

