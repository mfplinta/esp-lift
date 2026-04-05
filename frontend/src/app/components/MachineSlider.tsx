import { useRef, useState, useEffect, useCallback } from 'react';
import { shallowEqual } from 'react-redux';
import {
  setSliderThreshold,
  setSliderRepBand,
  useAppDispatch,
  useAppSelector,
} from '../store';

interface MachineSliderProps {
  isLeftSlider: boolean;
}

type DragTarget = 'threshold' | 'repBand' | null;

export default function MachineSlider({ isLeftSlider }: MachineSliderProps) {
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);

  const innerRef = useRef<HTMLDivElement | null>(null);
  const dragValueRef = useRef<number | null>(null);

  const dispatch = useAppDispatch();
  const { sliderThreshold, sliderRepBand, reps, position, isDarkMode } =
    useAppSelector(
      (s) => ({
        sliderThreshold: s.machine.sliderThreshold,
        sliderRepBand: s.machine.sliderRepBand,
        reps: s.machine.isAlternating
          ? isLeftSlider
            ? s.machine.repsLeft
            : s.machine.repsRight
          : s.machine.reps,
        position: s.machine.isAlternating
          ? isLeftSlider
            ? s.machine.sliderPositionLeft
            : s.machine.sliderPositionRight
          : s.machine.lastSliderPosition,
        isDarkMode: s.machine.config.theme === 'dark',
      }),
      shallowEqual
    );

  const computePercent = useCallback((clientY: number) => {
    if (!innerRef.current) return null;
    const rect = innerRef.current.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const rawPercentage = (relativeY / rect.height) * 100;
    const invertedPercentage = 100 - rawPercentage;
    return Math.max(0, Math.min(100, invertedPercentage));
  }, []);

  const linePx = 5;

  // Drag lifecycle
  useEffect(() => {
    if (!dragTarget) return;

    const handlePointerMove = (e: PointerEvent) => {
      const percent = computePercent(e.clientY);
      if (percent === null) return;

      let value: number;
      if (dragTarget === 'threshold') {
        value = percent;
      } else {
        // repBand handle dragged: compute repBand = threshold - pointer position
        value = Math.max(0, Math.min(100, sliderThreshold - percent));
      }

      dragValueRef.current = value;
      setDragValue(value);
    };

    const handlePointerUp = () => {
      const finalValue = dragValueRef.current ?? dragValue;
      if (finalValue !== null) {
        if (dragTarget === 'threshold') {
          dispatch(setSliderThreshold(finalValue));
        } else {
          dispatch(setSliderRepBand(finalValue));
        }
      }
      setDragTarget(null);
      setDragValue(null);
      dragValueRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [dragTarget, computePercent, dragValue, sliderThreshold, dispatch]);

  // Compute display values
  const displayThreshold =
    dragTarget === 'threshold' && dragValue !== null
      ? dragValue
      : sliderThreshold;

  const displayRepBand =
    dragTarget === 'repBand' && dragValue !== null ? dragValue : sliderRepBand;

  const repBandPosition = Math.max(0, displayThreshold - displayRepBand);

  const startDrag = (target: DragTarget) => (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragTarget(target);

    const percent = computePercent(e.clientY);
    if (percent === null) return;

    let value: number;
    if (target === 'threshold') {
      value = percent;
    } else {
      value = Math.max(0, Math.min(100, sliderThreshold - percent));
    }
    dragValueRef.current = value;
    setDragValue(value);
  };

  const thresholdTriangleColor = isDarkMode ? '#22c55e' : '#16a34a';
  const repBandTriangleColor = '#f97316';

  // Colors
  const weightColor = isDarkMode
    ? 'bg-gradient-to-b from-gray-500 to-gray-600'
    : 'bg-gradient-to-b from-gray-400 to-gray-500';
  const fillColor = isDarkMode
    ? 'bg-gradient-to-b from-lime-400 to-lime-500'
    : 'bg-gradient-to-b from-yellow-300 to-yellow-400';

  return (
    <div className="relative h-full">
      <div
        ref={innerRef}
        className="relative h-full w-48 rounded-3xl overflow-hidden select-none"
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
                className={`w-full h-0.5 sm:h-1 rounded ${isDarkMode ? 'bg-gray-400' : 'bg-gray-500'}`}
              />
            ))}
          </div>
        </div>

        {/* 2. Animation Flash */}
        {reps > 0 && (
          <div
            key={reps}
            className="absolute w-full h-full rounded-3xl pointer-events-none bg-white z-21 top-0"
            style={{
              animation: 'blink 0.3s ease-out',
            }}
          />
        )}

        {/* 3. Fill Level */}
        <div
          className={`absolute w-full transition-all rounded-b-3xl pointer-events-none z-20 ${fillColor} duration-100`}
          style={{ height: `${position}%`, bottom: 0 }}
        />
      </div>

      {[
        {
          value: displayThreshold,
          color: thresholdTriangleColor,
          target: 'threshold' as DragTarget,
        },
        {
          value: repBandPosition,
          color: repBandTriangleColor,
          target: 'repBand' as DragTarget,
        },
      ].map((band) => {
        return (
          <div key={band.target}>
            {/* Band Handle */}
            <div
              className="absolute w-full pointer-events-none z-30 flex items-center"
              style={{
                bottom: `${band.value}%`,
                transform: 'translateY(50%)',
                height: `${linePx}px`,
                backgroundColor: band.color,
              }}
            />
            {/* Triangle pointer */}
            <div
              className="absolute left-48 cursor-grab active:cursor-grabbing z-40 w-4 h-5 touch-none"
              style={{
                bottom: `${band.value}%`,
                transform: 'translate(0, 50%)',
                clipPath: 'polygon(100% 0%, 0% 50%, 100% 100%)',
                backgroundColor: band.color,
              }}
              onPointerDown={startDrag(band.target)}
            />
          </div>
        );
      })}
    </div>
  );
}
