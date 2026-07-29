import React from 'react';
import Datepicker from 'react-tailwindcss-datepicker';

export default function ModernDatePicker({
  name,
  value,
  onChange,
  className,
  placeholder = 'Select Date',
  disabled = false,
  required = false
}) {
  // Convert standard native YYYY-MM-DD to Datepicker format {startDate, endDate}
  const dateValue = {
    startDate: value || null,
    endDate: value || null,
  };

  const handleChange = (newValue) => {
    // newValue is { startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD" }
    // We simulate a standard input event for existing code
    const fakeEvent = {
      target: {
        name: name,
        value: newValue?.startDate || '',
      },
    };
    if (onChange) {
      onChange(fakeEvent);
    }
  };

  return (
    <>
      <style>
        {`
          /* Hide the ugly arrow to make it a sleek floating popover */
          .custom-datepicker .absolute.z-20.rotate-45 {
            display: none !important;
          }
          
          /* Target the inner calendar box directly */
          .custom-datepicker .absolute.z-10 > div:not(.rotate-45) {
            box-shadow: 0 16px 40px -10px rgba(0,0,0,0.15) !important;
            border: 1px solid #e5e7eb !important;
            border-radius: 16px !important;
            overflow: hidden !important;
            transform: none !important;
            margin-top: 4px !important;
          }
          
          .dark .custom-datepicker .absolute.z-10 > div:not(.rotate-45) {
            border-color: rgba(55, 65, 81, 0.5) !important;
            box-shadow: 0 16px 40px -10px rgba(0,0,0,0.5) !important;
          }
          
          /* Make the active selected dates pop more */
          .custom-datepicker .bg-blue-500 {
            background-color: var(--brand-500, #3b82f6) !important;
          }
          
          /* Improve today's date shortcut style */
          .custom-datepicker button[data-action="shortcut"] {
            font-weight: 600 !important;
            color: var(--brand-600, #2563eb) !important;
            background: var(--brand-50, #eff6ff) !important;
            border-radius: 8px !important;
            margin: 4px !important;
            border: 1px solid transparent !important;
            transition: all 0.2s;
          }
          .custom-datepicker button[data-action="shortcut"]:hover {
            border-color: var(--brand-300, #93c5fd) !important;
            background: white !important;
          }
        `}
      </style>
      <div className="custom-datepicker relative w-full">
        <Datepicker
        primaryColor="blue"
        asSingle={true}
        useRange={false}
        value={dateValue}
        onChange={handleChange}
        displayFormat="YYYY-MM-DD"
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        readOnly={true}
        showShortcuts={true}
        configs={{
          shortcuts: {
            today: "Today",
          },
        }}
        inputClassName={
          className ||
          'w-full bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/50 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 hover:bg-gray-100/50 dark:hover:bg-gray-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm'
        }
        toggleClassName="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-brand-500 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors rounded-lg"
      />
      </div>
    </>
  );
}
