import React, { forwardRef } from 'react';

interface MachineSliderProps {
  position: number;
  threshold: number;
  theme: 'light' | 'dark';
  animate: boolean;
  onThresholdDragStart: (e: React.MouseEvent | React.TouchEvent) => void;
}

const MachineSlider = forwardRef<HTMLDivElement, MachineSliderProps>(
  ({ position, threshold, theme, animate, onThresholdDragStart }, ref) => {
    // Theme-based colors
    const weightColor =
      theme === 'dark'
        ? 'bg-gradient-to-b from-gray-500 to-gray-600'
        : 'bg-gradient-to-b from-gray-400 to-gray-500';

    const thresholdColor = theme === 'dark' ? 'bg-green-500' : 'bg-green-600';
    const dotColor = theme === 'dark' ? 'bg-green-300' : 'bg-green-800';

    const fillColor =
      theme === 'dark'
        ? 'bg-gradient-to-b from-lime-400 to-lime-500'
        : 'bg-gradient-to-b from-yellow-300 to-yellow-400';

    return (
      <div
        ref={ref}
        className="relative h-full w-32 sm:w-40 rounded-3xl overflow-hidden"
      >
        {/* 1. Fixed Weight Stack Background */}
        <div
          className={`absolute w-full h-full ${weightColor} rounded-3xl pointer-events-none top-0`}
        >
          <div className="w-full h-full flex flex-col justify-evenly px-3 sm:px-4 py-2">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className={`w-full h-0.5 sm:h-1 rounded ${
                  theme === 'dark' ? 'bg-gray-400' : 'bg-gray-500'
                }`}
              />
            ))}
          </div>
        </div>

        {/* 2. Animation Flash Overlay */}
        {animate && (
          <div className="absolute w-full h-full rounded-3xl pointer-events-none bg-white z-21 animate-[fadeOut_0.4s_ease-out] top-0" />
        )}

        {/* 3. Active Fill Level */}
        <div
          className={`absolute w-full transition-all rounded-b-3xl pointer-events-none z-20 ${fillColor} duration-100`}
          style={{ height: `${position}%`, bottom: 0 }}
        />

        {/* 4. Draggable Threshold Line */}
        <div
          className={`absolute w-full h-5 ${thresholdColor} cursor-grab active:cursor-grabbing z-20 shadow-lg`}
          style={{ bottom: `${threshold}%`, transform: 'translateY(50%)' }}
          onMouseDown={onThresholdDragStart}
          onTouchStart={onThresholdDragStart}
        >
          {/* Dots */}
          <div className="absolute inset-0 flex items-center justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
            ))}
          </div>
        </div>

        {/* 5. Threshold Extensions (Visual only) */}
        <div
          className={`absolute h-1 ${thresholdColor} z-20 shadow-lg rounded-l-full pointer-events-none`}
          style={{
            bottom: `${threshold}%`,
            transform: 'translateY(50%)',
            left: '-60px',
            width: '60px',
          }}
        />
        <div
          className={`absolute h-1 ${thresholdColor} z-20 shadow-lg rounded-r-full pointer-events-none`}
          style={{
            bottom: `${threshold}%`,
            transform: 'translateY(50%)',
            right: '-60px',
            width: '60px',
          }}
        />
      </div>
    );
  }
);

export default MachineSlider;
