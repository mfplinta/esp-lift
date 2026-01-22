import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';

interface MachineSliderProps {
  isLeftSlider: boolean;
}

export default function MachineSlider({ isLeftSlider }: MachineSliderProps) {
  const [animate, setAnimate] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isNear, setIsNear] = useState(false);

  const innerRef = useRef<HTMLDivElement | null>(null);

  const { sliderThreshold, reps, position, config, setSliderThreshold } =
    useStore(
      useShallow((s) => ({
        sliderThreshold: s.sliderThreshold,
        reps: s.isAlternating
          ? isLeftSlider
            ? s.repsLeft
            : s.repsRight
          : s.reps,
        position: s.isAlternating
          ? isLeftSlider
            ? s.sliderPositionLeft
            : s.sliderPositionRight
          : s.lastSliderPosition,
        config: s.config,
        setSliderThreshold: s.setSliderThreshold,
      }))
    );

  const prevReps = useRef(reps);

  const updateThreshold = useCallback(
    (clientY: number) => {
      if (!innerRef.current) return;

      const rect = innerRef.current.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      const rawPercentage = (relativeY / rect.height) * 100;
      const invertedPercentage = 100 - rawPercentage;

      setSliderThreshold(Math.max(0, Math.min(100, invertedPercentage)));
    },
    [setSliderThreshold]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      updateThreshold(e.clientY);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      setIsNear(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, updateThreshold]);

  const proximityPx = 25;
  const baseLinePx = 5;
  const expandedLinePx = 20;

  const handleContainerPointerMove = (e: React.PointerEvent) => {
    if (isDragging || !innerRef.current) return;

    const rect = innerRef.current.getBoundingClientRect();
    const thresholdBottomPx = rect.height * (sliderThreshold / 100);
    const thresholdCenterY = rect.bottom - thresholdBottomPx;
    const dist = Math.abs(e.clientY - thresholdCenterY);

    setIsNear(dist <= proximityPx);
  };

  const handleDragStart = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
  };

  useEffect(() => {
    if (reps !== prevReps.current && reps !== undefined && reps > 0) {
      setAnimate(true);
      const timer = setTimeout(() => setAnimate(false), 400);
      return () => clearTimeout(timer);
    }
    prevReps.current = reps;
  }, [reps]);

  const active = isNear || isDragging;
  const visibleLinePx = active ? expandedLinePx : baseLinePx;
  const hitboxPx = visibleLinePx + proximityPx * 2;

  const weightColor =
    config.theme === 'dark'
      ? 'bg-gradient-to-b from-gray-500 to-gray-600'
      : 'bg-gradient-to-b from-gray-400 to-gray-500';
  const thresholdColor =
    config.theme === 'dark' ? 'bg-green-500' : 'bg-green-600';
  const dotColor = config.theme === 'dark' ? 'bg-green-300' : 'bg-green-800';
  const fillColor =
    config.theme === 'dark'
      ? 'bg-gradient-to-b from-lime-400 to-lime-500'
      : 'bg-gradient-to-b from-yellow-300 to-yellow-400';

  return (
    <div
      ref={innerRef}
      className="relative h-full w-32 sm:w-40 rounded-3xl overflow-hidden select-none"
      onPointerMove={handleContainerPointerMove}
      onMouseLeave={() => !isDragging && setIsNear(false)}
      style={{ touchAction: 'none' }}
    >
      {/* 1. Weight Stack Background */}
      <div
        className={`absolute w-full h-full ${weightColor} rounded-3xl pointer-events-none top-0`}
      >
        <div className="w-full h-full flex flex-col justify-evenly px-3 sm:px-4 py-2">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className={`w-full h-0.5 sm:h-1 rounded ${config.theme === 'dark' ? 'bg-gray-400' : 'bg-gray-500'}`}
            />
          ))}
        </div>
      </div>

      {/* 2. Animation Flash */}
      {animate && (
        <div className="absolute w-full h-full rounded-3xl pointer-events-none bg-white z-21 animate-[fadeOut_0.4s_ease-out] top-0" />
      )}

      {/* 3. Fill Level */}
      <div
        className={`absolute w-full transition-all rounded-b-3xl pointer-events-none z-20 ${fillColor} duration-100`}
        style={{ height: `${position}%`, bottom: 0 }}
      />

      {/* 4. Draggable Handle */}
      <div
        className="absolute w-full cursor-grab active:cursor-grabbing z-30 flex items-center"
        onPointerDown={handleDragStart}
        style={{
          bottom: `${sliderThreshold}%`,
          transform: 'translateY(50%)',
          height: `${hitboxPx}px`,
          touchAction: 'none',
        }}
      >
        <div
          className={`${thresholdColor} shadow-lg rounded-full w-full relative pointer-events-none`}
          style={{
            height: `${visibleLinePx}px`,
            transition: 'height 160ms ease',
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
            ))}
          </div>
        </div>
      </div>

      <div
        className={`absolute ${thresholdColor} z-20 shadow-lg rounded-l-full pointer-events-none`}
        style={{
          bottom: `${sliderThreshold}%`,
          transform: 'translateY(50%)',
          left: '-60px',
          width: '60px',
          height: `${visibleLinePx}px`,
          transition: 'height 160ms ease',
        }}
      />
      <div
        className={`absolute ${thresholdColor} z-20 shadow-lg rounded-r-full pointer-events-none`}
        style={{
          bottom: `${sliderThreshold}%`,
          transform: 'translateY(50%)',
          right: '-60px',
          width: '60px',
          height: `${visibleLinePx}px`,
          transition: 'height 160ms ease',
        }}
      />
    </div>
  );
}
