import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className = '',
      label,
      error,
      hint,
      icon,
      leftIcon,
      rightIcon,
      leftElement,
      rightElement,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const effectiveLeftIcon = leftIcon || icon;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {(effectiveLeftIcon || leftElement) && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              {leftElement || effectiveLeftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              w-full
              bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800
              text-slate-900 dark:text-white placeholder:text-slate-400
              rounded-lg
              transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
              disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed
              ${(effectiveLeftIcon || leftElement) ? 'pl-10' : 'pl-4'}
              ${(rightIcon || rightElement) ? 'pr-10' : 'pr-4'}
              py-2.5
              text-sm
              ${error ? 'border-rose-500 focus:ring-rose-500' : ''}
              ${className}
            `}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...props}
          />
          {(rightIcon || rightElement) && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
              {rightElement || rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="mt-1.5 text-sm text-rose-500" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="mt-1.5 text-sm text-slate-500">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;