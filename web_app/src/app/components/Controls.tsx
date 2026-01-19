interface ControlsProps {
  onCompleteSet: () => void;
  onReset: () => void;
  theme: 'light' | 'dark';
  hasReps: boolean;
}

export default function Controls({
  onCompleteSet,
  onReset,
  theme,
  hasReps,
}: ControlsProps) {
  const buttonBaseClass =
    'px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95 whitespace-nowrap';

  const primaryButton =
    theme === 'dark'
      ? 'bg-white text-black hover:bg-gray-200'
      : 'bg-black text-white hover:bg-gray-800';

  const secondaryButton =
    theme === 'dark'
      ? 'bg-gray-800 text-white hover:bg-gray-700 border-2 border-gray-700'
      : 'bg-gray-200 text-black hover:bg-gray-300 border-2 border-gray-300';

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={onCompleteSet}
        disabled={!hasReps}
        className={`${buttonBaseClass} ${primaryButton} ${
          !hasReps ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        Complete Set
      </button>

      <button
        onClick={onReset}
        className={`${buttonBaseClass} ${secondaryButton} cursor-pointer`}
      >
        Reset All
      </button>
    </div>
  );
}
