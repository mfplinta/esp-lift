import MachineSlider from './MachineSlider';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';

export default function MachineVisualizer() {
  const { repsLeft, repsRight, config, isAlternating } = useStore(
    useShallow((s) => ({
      repsLeft: s.repsLeft,
      repsRight: s.repsRight,
      config: s.config,
      isAlternating: s.isAlternating,
    }))
  );

  return (
    <div className="relative w-full h-full flex flex-col justify-center items-center">
      {/* 1. Header: Alternating Rep Counts */}
      {isAlternating && (
        <div className="flex gap-6 w-full justify-center mb-1">
          <div className="w-32 sm:w-40 text-center">
            <span
              className={`text-4xl font-semibold ${config.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
            >
              {repsLeft || 0}
            </span>
          </div>
          <div className="w-32 sm:w-40 text-center">
            <span
              className={`text-4xl font-semibold ${config.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
            >
              {repsRight || 0}
            </span>
          </div>
        </div>
      )}

      {/* 2. Sliders Container */}
      <div
        className={`relative w-full h-full flex justify-center items-center ${isAlternating ? 'gap-6' : ''}`}
      >
        {/* Left / Main Slider */}
        <MachineSlider isLeftSlider={true} />

        {/* Right Slider (Optional) */}
        {isAlternating && <MachineSlider isLeftSlider={false} />}
      </div>
    </div>
  );
}
