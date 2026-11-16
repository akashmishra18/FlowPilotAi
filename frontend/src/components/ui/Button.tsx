import { ButtonHTMLAttributes, forwardRef } from 'react';
import { LoaderCircle } from 'lucide-react';
import { ButtonSize, ButtonVariant, buttonClasses } from './buttonStyles';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, className, isLoading = false, disabled, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    >
      {isLoading && <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});

export default Button;
