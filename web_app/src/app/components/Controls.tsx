import { CSSProperties } from 'react';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';

export default function Controls() {
  const { sets, config, hasReps, reset, completeSet } = useStore(
    useShallow((s) => ({
      sets: s.sets,
      config: s.config,
      hasReps: s.reps > 0,
      reset: s.reset,
      completeSet: s.completeSetOrRest,
    }))
  );

  const buttonBaseClass =
    'px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95 whitespace-nowrap';

  const primaryButton =
    config.theme === 'dark'
      ? 'bg-white text-black hover:bg-gray-200'
      : 'bg-black text-white hover:bg-gray-800';

  const secondaryButton =
    config.theme === 'dark'
      ? 'bg-gray-800 text-white hover:bg-gray-700 border-2 border-gray-700'
      : 'bg-gray-200 text-black hover:bg-gray-300 border-2 border-gray-300';

  const borderColor =
    config.theme === 'dark' ? 'border-gray-800' : 'border-gray-200';

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`font-bold text-center whitespace-nowrap leading-none ${config.theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}
        style={{
          fontSize: '48px',
          marginBottom: '0.2em',
        }}
      >
        Sets: {sets}
      </div>

      <button
        onClick={completeSet}
        disabled={!hasReps}
        className={`${buttonBaseClass} ${primaryButton} ${
          !hasReps ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        Complete Set
      </button>

      <button
        onClick={reset}
        className={`${buttonBaseClass} ${secondaryButton} cursor-pointer`}
      >
        Reset All
      </button>
    </div>
  );
}
