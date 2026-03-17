import React, { useRef, useState, useEffect, useCallback } from 'react';
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
  const [animate, setAnimate] = useState(false);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [nearTarget, setNearTarget] = useState<DragTarget>(null);
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

  const prevReps = useRef(reps);

  const computePercent = useCallback((clientY: number) => {
    if (!innerRef.current) return null;
    const rect = innerRef.current.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const rawPercentage = (relativeY / rect.height) * 100;
    const invertedPercentage = 100 - rawPercentage;
    return Math.max(0, Math.min(100, invertedPercentage));
  }, []);

  const getHandleYPx = useCallback((percent: number) => {
    if (!innerRef.current) return 0;
    const rect = innerRef.current.getBoundingClientRect();
    return rect.bottom - rect.height * (percent / 100);
  }, []);

  const proximityPx = 15;
  const baseLinePx = 5;
  const expandedLinePx = 20;

  const findNearestHandle = useCallback(
    (clientY: number): DragTarget => {
      if (!innerRef.current) return null;
      const thresholdY = getHandleYPx(sliderThreshold);
      const repBandPos = Math.max(0, sliderThreshold - sliderRepBand);
      const repBandY = getHandleYPx(repBandPos);

      const distThreshold = Math.abs(clientY - thresholdY);
      const distRepBand = Math.abs(clientY - repBandY);

      if (distThreshold <= proximityPx && distRepBand <= proximityPx) {
        return distThreshold <= distRepBand ? 'threshold' : 'repBand';
      }
      if (distThreshold <= proximityPx) return 'threshold';
      if (distRepBand <= proximityPx) return 'repBand';
      return null;
    },
    [sliderThreshold, sliderRepBand, getHandleYPx]
  );

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

  const handleContainerPointerMove = (e: React.PointerEvent) => {
    if (dragTarget) return;
    setNearTarget(findNearestHandle(e.clientY));
  };

  const handleContainerPointerLeave = () => {
    if (!dragTarget) setNearTarget(null);
  };

  const startDrag = (target: DragTarget) => (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragTarget(target);
    setNearTarget(target);

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

  // Flash animation on rep count
  useEffect(() => {
    if (reps !== prevReps.current && reps !== undefined && reps > 0) {
      setAnimate(true);
      const timer = setTimeout(() => setAnimate(false), 400);
      return () => clearTimeout(timer);
    }
    prevReps.current = reps;
  }, [reps]);

  // Handle visual states
  const thresholdActive =
    nearTarget === 'threshold' || dragTarget === 'threshold';
  const repBandActive = nearTarget === 'repBand' || dragTarget === 'repBand';

  const thresholdLinePx = thresholdActive ? expandedLinePx : baseLinePx;
  const repBandLinePx = repBandActive ? expandedLinePx : baseLinePx;
  const thresholdHitboxPx = thresholdLinePx + proximityPx * 2;
  const repBandHitboxPx = repBandLinePx + proximityPx * 2;

  // Colors
  const weightColor = isDarkMode
    ? 'bg-gradient-to-b from-gray-500 to-gray-600'
    : 'bg-gradient-to-b from-gray-400 to-gray-500';
  const thresholdColor = isDarkMode ? 'bg-green-500' : 'bg-green-600';
  const thresholdDotColor = isDarkMode ? 'bg-green-300' : 'bg-green-800';
  const repBandColor = isDarkMode ? 'bg-orange-500' : 'bg-orange-500';
  const repBandDotColor = isDarkMode ? 'bg-orange-300' : 'bg-orange-800';
  const fillColor = isDarkMode
    ? 'bg-gradient-to-b from-lime-400 to-lime-500'
    : 'bg-gradient-to-b from-yellow-300 to-yellow-400';

  return (
    <div
      ref={innerRef}
      className="relative h-full w-32 sm:w-40 rounded-3xl overflow-hidden select-none"
      onPointerMove={handleContainerPointerMove}
      onMouseLeave={handleContainerPointerLeave}
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
      {animate && (
        <div className="absolute w-full h-full rounded-3xl pointer-events-none bg-white z-21 animate-[fadeOut_0.4s_ease-out] top-0" />
      )}

      {/* 3. Fill Level */}
      <div
        className={`absolute w-full transition-all rounded-b-3xl pointer-events-none z-20 ${fillColor} duration-100`}
        style={{ height: `${position}%`, bottom: 0 }}
      />

      {/* 4. Threshold Handle (green) */}
      <div
        className="absolute w-full cursor-grab active:cursor-grabbing z-30 flex items-center"
        onPointerDown={startDrag('threshold')}
        style={{
          bottom: `${displayThreshold}%`,
          transform: 'translateY(50%)',
          height: `${thresholdHitboxPx}px`,
          touchAction: 'none',
        }}
      >
        <div
          className={`${thresholdColor} shadow-lg rounded-full w-full relative pointer-events-none`}
          style={{
            height: `${thresholdLinePx}px`,
            transition: 'height 160ms ease',
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${thresholdDotColor}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Threshold overflow wings */}
      <div
        className={`absolute ${thresholdColor} z-20 shadow-lg rounded-l-full pointer-events-none`}
        style={{
          bottom: `${displayThreshold}%`,
          transform: 'translateY(50%)',
          left: '-60px',
          width: '60px',
          height: `${thresholdLinePx}px`,
          transition: 'height 160ms ease',
        }}
      />
      <div
        className={`absolute ${thresholdColor} z-20 shadow-lg rounded-r-full pointer-events-none`}
        style={{
          bottom: `${displayThreshold}%`,
          transform: 'translateY(50%)',
          right: '-60px',
          width: '60px',
          height: `${thresholdLinePx}px`,
          transition: 'height 160ms ease',
        }}
      />

      {/* 5. Rep Band Handle (orange) */}
      <div
        className="absolute w-full cursor-grab active:cursor-grabbing z-30 flex items-center"
        onPointerDown={startDrag('repBand')}
        style={{
          bottom: `${repBandPosition}%`,
          transform: 'translateY(50%)',
          height: `${repBandHitboxPx}px`,
          touchAction: 'none',
        }}
      >
        <div
          className={`${repBandColor} shadow-lg rounded-full w-full relative pointer-events-none`}
          style={{
            height: `${repBandLinePx}px`,
            transition: 'height 160ms ease',
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${repBandDotColor}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Rep Band overflow wings */}
      <div
        className={`absolute ${repBandColor} z-20 shadow-lg rounded-l-full pointer-events-none`}
        style={{
          bottom: `${repBandPosition}%`,
          transform: 'translateY(50%)',
          left: '-60px',
          width: '60px',
          height: `${repBandLinePx}px`,
          transition: 'height 160ms ease',
        }}
      />
      <div
        className={`absolute ${repBandColor} z-20 shadow-lg rounded-r-full pointer-events-none`}
        style={{
          bottom: `${repBandPosition}%`,
          transform: 'translateY(50%)',
          right: '-60px',
          width: '60px',
          height: `${repBandLinePx}px`,
          transition: 'height 160ms ease',
        }}
      />
    </div>
  );
}
