import clsx from 'clsx';

type LogoProps = {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'horizontal' | 'stacked';
  animated?: boolean;
};

const logoSizeClasses: Record<NonNullable<LogoProps['size']>, string> = {
  sm: 'max-h-9',
  md: 'max-h-10',
  lg: 'max-h-20 md:max-h-24',
};

export default function Logo({ size = 'md', variant = 'horizontal', animated = false }: LogoProps) {
  return (
    <span className={clsx('inline-flex max-w-full items-center justify-center', animated && 'fp-logo-entrance')}>
      <img
        className={clsx('h-auto w-auto object-contain max-w-full', logoSizeClasses[size], animated && 'fp-logo-float')}
        src={variant === 'stacked' ? '/flowpilot-logo-stacked.png' : '/flowpilot-logo-horizontal.png'}
        alt="FlowPilot"
        draggable={false}
      />
    </span>
  );
}
