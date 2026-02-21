import { shallowEqual } from 'react-redux';
import { useAppSelector } from '../store';

interface StatsDisplayProps {
  size?: 'normal' | 'large';
  highlight?: boolean;
  repsTone?: 'normal' | 'near' | 'reached';
}

export default function StatsDisplay({
  size = 'normal',
  highlight = false,
  repsTone = 'normal',
}: StatsDisplayProps) {
  const { isResting, activeTime, isDarkMode, reps, sets } = useAppSelector(
    (s) => ({
      isResting: s.machine.isResting,
      activeTime: s.machine.activeTime,
      isDarkMode: s.machine.config.theme === 'dark',
      reps: s.machine.reps,
      sets: s.machine.sets,
    }),
    shallowEqual
  );

  const repsSize =
    size === 'large'
      ? 'text-[clamp(2.5rem,6vw,4.75rem)]'
      : 'text-3xl sm:text-4xl lg:text-5xl';
  const setsSize =
    size === 'large'
      ? 'text-[clamp(2rem,5vw,3.75rem)]'
      : 'text-2xl sm:text-3xl lg:text-4xl';
  const labelColor = highlight
    ? isDarkMode
      ? 'text-red-300'
      : 'text-red-700'
    : isDarkMode
      ? 'text-white'
      : 'text-black';

  const subLabelColor = isDarkMode ? 'text-red-300/70' : 'text-red-700/70';

  const repsToneColor =
    repsTone === 'reached'
      ? 'text-green-400'
      : repsTone === 'near'
        ? 'text-yellow-300'
        : labelColor;

  return (
    <div
      className={`whitespace-nowrap border rounded-2xl px-[clamp(14px,2.6vw,24px)] py-[clamp(10px,2vw,18px)] ${
        isDarkMode ? 'border-white/15' : 'border-black/15'
      }`}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[clamp(16px,3vw,28px)]">
        <div className="flex flex-col items-center">
          <div
            className={`text-xs sm:text-sm font-semibold tracking-widest uppercase ${subLabelColor}`}
          >
            Sets
          </div>
          <div
            className={`${setsSize} font-bold ${labelColor} tabular-nums text-center min-w-[3ch]`}
          >
            {sets}
          </div>
        </div>

        <div
          className={`h-[clamp(44px,9vw,64px)] w-px ${
            isDarkMode ? 'bg-white/20' : 'bg-black/20'
          }`}
        />

        <div className="flex flex-col items-center">
          <div
            className={`text-xs sm:text-sm font-semibold tracking-widest uppercase ${subLabelColor}`}
          >
            {isResting ? 'Rest' : 'Reps'}
          </div>
          {isResting ? (
            <span
              className={`${repsSize} font-bold transition-opacity duration-500 inline-block tabular-nums text-center min-w-[3ch] ${
                isResting ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {activeTime.toFixed(1)}s
            </span>
          ) : (
            <span
              className={`${repsSize} font-bold transition-opacity duration-500 inline-block tabular-nums text-center min-w-[3ch] ${
                !isResting ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <span className={highlight ? labelColor : repsToneColor}>
                {reps}
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
