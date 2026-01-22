import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';

interface StatsDisplayProps {
  size?: 'normal' | 'large';
  highlight?: boolean;
}

export default function StatsDisplay({
  size = 'normal',
  highlight = false,
}: StatsDisplayProps) {
  const { isResting, activeTime, config, reps, isAlternating } = useStore(
    useShallow((s) => ({
      isResting: s.isResting,
      activeTime: s.activeTime,
      config: s.config,
      reps: s.reps,
      isAlternating: s.isAlternating,
    }))
  );

  const textSize =
    size === 'large' ? 'text-9xl' : 'text-3xl sm:text-4xl lg:text-5xl';
  const labelColor = highlight
    ? config.theme === 'dark'
      ? 'text-red-400'
      : 'text-red-600'
    : config.theme === 'dark'
      ? 'text-white'
      : 'text-black';

  return (
    <div className={`${labelColor} whitespace-nowrap`}>
      {isResting ? (
        <span
          className={`${textSize} font-bold transition-opacity duration-500 inline-block ${
            isResting ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {activeTime.toFixed(1)}s
        </span>
      ) : (
        <span
          className={`${textSize} font-bold transition-opacity duration-500 inline-block ${
            !isResting ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span className={highlight ? labelColor : ''}>{reps}</span>
        </span>
      )}
    </div>
  );
}
