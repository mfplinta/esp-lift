interface StatsDisplayProps {
  label: string;
  value: number;
  theme: 'light' | 'dark';
  size?: 'normal' | 'large';
  highlight?: boolean;
  isResting?: boolean;
  restTime?: number;
}

export default function StatsDisplay({
  label,
  value,
  theme,
  size = 'normal',
  highlight = false,
  isResting = false,
  restTime = 0,
}: StatsDisplayProps) {
  const textSize =
    size === 'large' ? 'text-9xl' : 'text-3xl sm:text-4xl lg:text-5xl';
  const labelColor = highlight
    ? theme === 'dark'
      ? 'text-red-400'
      : 'text-red-600'
    : theme === 'dark'
      ? 'text-white'
      : 'text-black';

  // Don't render rest/reps mode at all - just one or the other with fade
  return (
    <div className={`${labelColor} whitespace-nowrap`}>
      {isResting ? (
        <span
          className={`${textSize} font-bold transition-opacity duration-500 inline-block ${
            isResting ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {restTime.toFixed(1)}s
        </span>
      ) : (
        <span
          className={`${textSize} font-bold transition-opacity duration-500 inline-block ${
            !isResting ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span className={highlight ? labelColor : ''}>{value}</span>
        </span>
      )}
    </div>
  );
}
