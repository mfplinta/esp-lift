import { shallowEqual } from 'react-redux';
import {
  completeSetOrRest,
  reset,
  useAppDispatch,
  useAppSelector,
} from '../store';

export default function Controls() {
  const dispatch = useAppDispatch();
  const { isDarkMode, hasReps } = useAppSelector(
    (s) => ({
      isDarkMode: s.machine.config.theme === 'dark',
      hasReps: s.machine.reps > 0,
    }),
    shallowEqual
  );

  const buttonBaseClass =
    'px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95 whitespace-nowrap';

  const primaryEnabled = isDarkMode
    ? 'bg-white/95 text-black hover:bg-white'
    : 'bg-black/95 text-white hover:bg-black';

  const primaryDisabled = isDarkMode
    ? 'bg-white/60 text-black'
    : 'bg-black/60 text-white';

  const secondaryButton = isDarkMode
    ? 'bg-gray-800 text-white hover:bg-gray-700 border-2 border-gray-700'
    : 'bg-gray-200 text-black hover:bg-gray-300 border-2 border-gray-300';

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => dispatch(completeSetOrRest())}
        disabled={!hasReps}
        className={`${buttonBaseClass} ${hasReps ? primaryEnabled : primaryDisabled} backdrop-blur-[4px]`}
      >
        Complete Set
      </button>

      <button
        onClick={() => dispatch(reset())}
        className={`${buttonBaseClass} ${secondaryButton} cursor-pointer`}
      >
        Reset All
      </button>
    </div>
  );
}
