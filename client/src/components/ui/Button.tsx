import React from 'react';
import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'icon';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const buttonVariants = {
  primary: 'bg-primary-500 hover:bg-primary-600 text-white border border-primary-500',
  secondary: 'bg-secondary-100 hover:bg-secondary-200 text-secondary-700 border border-secondary-200',
  outline: 'bg-transparent hover:bg-primary-50 text-primary-500 border border-primary-500',
  ghost: 'bg-transparent hover:bg-secondary-100 text-secondary-600 border border-transparent',
  danger: 'bg-danger-500 hover:bg-danger-600 text-white border border-danger-500',
  success: 'bg-success-500 hover:bg-success-600 text-white border border-success-500',
};

const buttonSizes = {
  sm: 'h-8 px-3 text-xs rounded-md gap-1.5',
  md: 'h-10 px-4 text-sm rounded-lg gap-2',
  lg: 'h-12 px-6 text-base rounded-lg gap-2',
  xl: 'h-14 px-8 text-lg rounded-xl gap-3',
  icon: 'h-10 w-10 p-0 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-offset-2',
          'focus:ring-primary-500 focus:ring-offset-0',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'active:scale-[0.98]',
          buttonVariants[variant],
          buttonSizes[size],
          fullWidth && 'w-full',
          className
        )}
        disabled={isDisabled}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <>
            {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;