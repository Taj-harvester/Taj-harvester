import React from 'react';
import { X } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'danger' | 'amber';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', children, ...props }, ref) => {
    const base =
      'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap shrink-0 cursor-pointer';

    const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
      primary: 'bg-slate-900 text-white hover:bg-slate-800',
      amber: 'bg-amber-600 text-white hover:bg-amber-700',
      secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
      outline: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
      ghost: 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
      destructive: 'bg-red-600 text-white hover:bg-red-700',
      danger: 'bg-red-600 text-white hover:bg-red-700',
    };

    const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
      sm: 'min-h-[38px] px-3 py-1.5 text-xs',
      md: 'min-h-[42px] px-4 py-2 text-sm',
      lg: 'min-h-[48px] px-5 py-2.5 text-base font-semibold',
    };

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

export function Badge({
  variant = 'slate',
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: 'slate' | 'amber' | 'emerald' | 'red';
}) {
  const styles: Record<'slate' | 'amber' | 'emerald' | 'red', string> = {
    slate: 'bg-slate-100 text-slate-800 border-slate-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold leading-tight whitespace-nowrap ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

export function Card({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function Input({
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full min-h-[42px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-colors ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = '',
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`min-h-[42px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-colors ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  maxWidth?: string;
  children: React.ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  maxWidth = 'max-w-xl',
  children,
}: DialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[1px] overflow-y-auto no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div
        className={`relative w-full ${maxWidth} bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden my-8`}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div>
            <h2 id="dialog-title" className="text-lg font-bold text-slate-900 font-display">
              {title}
            </h2>
            {description && (
              <p className="text-xs text-slate-600 mt-0.5">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 max-h-[82vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
