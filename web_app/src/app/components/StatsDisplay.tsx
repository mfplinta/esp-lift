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
  const { isResting, activeTime, isDarkMode, reps, sets } = useStore(
    useShallow((s) => ({
      isResting: s.isResting,
      activeTime: s.activeTime,
      isDarkMode: s.config.theme === 'dark',
      reps: s.reps,
      sets: s.sets,
    }))
  );

  const textSize =
    size === 'large' ? 'text-9xl' : 'text-3xl sm:text-4xl lg:text-5xl';
  const labelColor = highlight
    ? isDarkMode
      ? 'text-red-300'
      : 'text-red-700'
    : isDarkMode
      ? 'text-white'
      : 'text-black';

  const subLabelColor = isDarkMode ? 'text-red-300/70' : 'text-red-700/70';

  return (
    <div className={`${labelColor} whitespace-nowrap text-center`}>
      <div
        className={`text-xs sm:text-sm font-semibold tracking-widest uppercase ${subLabelColor}`}
      >
        Sets
      </div>
      <div className={`text-2xl sm:text-3xl font-bold ${labelColor}`}>
        {sets}
      </div>

      <div className="mt-3">
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

      {!isResting && (
        <div
          className={`text-xs sm:text-sm font-semibold tracking-widest uppercase ${subLabelColor}`}
        >
          Reps
        </div>
      )}
    </div>
  );
}
