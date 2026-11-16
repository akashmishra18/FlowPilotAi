import { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, forwardRef, useId, useState } from 'react';
import clsx from 'clsx';
import { Eye, EyeOff } from 'lucide-react';

const control =
  'w-full rounded-lg border border-slate-700 bg-raised px-3 text-sm text-slate-100 placeholder:text-slate-400 ' +
  'transition-colors hover:border-brand-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60';

function controlClass(invalid?: boolean, className?: string) {
  return clsx(control, invalid ? 'border-rose-400' : 'border-slate-200', className);
}

interface InvalidProp {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & InvalidProp>(
  function Input({ invalid, className, ...rest }, ref) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={controlClass(invalid, clsx('h-10', className))} {...rest} />;
  },
);

/** Password field with an accessible show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & InvalidProp>(
  function PasswordInput({ className, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <Input ref={ref} type={visible ? 'text' : 'password'} className={clsx('pr-11', className)} {...rest} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:text-slate-700"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & InvalidProp>(
  function Textarea({ invalid, className, rows = 3, ...rest }, ref) {
    return (
      <textarea ref={ref} rows={rows} aria-invalid={invalid || undefined} className={controlClass(invalid, clsx('py-2', className))} {...rest} />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & InvalidProp>(
  function Select({ invalid, className, children, ...rest }, ref) {
    return (
      <select ref={ref} aria-invalid={invalid || undefined} className={controlClass(invalid, clsx('h-10 pr-8', className))} {...rest}>
        {children}
      </select>
    );
  },
);

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** Receives the id / aria wiring to spread onto the actual control. */
  children: (control: { id: string; 'aria-describedby'?: string; invalid: boolean }) => ReactNode;
}

/** Label + control + hint + error, with ids wired for screen readers. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-200">
        {label}
        {required && (
          <span className="ml-0.5 text-rose-300" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children({ id, 'aria-describedby': describedBy, invalid: Boolean(error) })}
      {error && (
          <p id={errorId} role="alert" className="mt-1.5 text-xs text-rose-300">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-slate-400">
          {hint}
        </p>
      )}
    </div>
  );
}
