import { useState, useRef, useEffect } from 'react';
import MachineSlider from './MachineSlider';

interface MachineVisualizerProps {
  handlePosition: number;
  handlePositionRight?: number;
  thresholdPosition: number;
  onPositionChange: (position: number) => void;
  onPositionRightChange?: (position: number) => void;
  onThresholdChange: (position: number) => void;
  theme: 'light' | 'dark';
  isAlternating?: boolean;
  repsLeft?: number;
  repsRight?: number;
  totalReps?: number;
}

export default function MachineVisualizer({
  handlePosition,
  handlePositionRight,
  thresholdPosition,
  onPositionChange,
  onThresholdChange,
  theme,
  isAlternating = false,
  repsLeft,
  repsRight,
  totalReps,
}: MachineVisualizerProps) {
  const [isDraggingThreshold, setIsDraggingThreshold] = useState(false);
  const [animateLeft, setAnimateLeft] = useState(false);
  const [animateRight, setAnimateRight] = useState(false);

  // We only need one ref to calculate vertical metrics since both sliders are aligned
  const containerRef = useRef<HTMLDivElement>(null);

  const prevRepsLeft = useRef(repsLeft);
  const prevRepsRight = useRef(repsRight);
  const prevTotalReps = useRef(totalReps);

  // --- Animation Triggers ---

  // Left/Singular Animation
  useEffect(() => {
    const hasSingularChanged =
      !isAlternating &&
      totalReps !== prevTotalReps.current &&
      totalReps !== undefined &&
      totalReps > 0;
    const hasLeftChanged =
      isAlternating &&
      repsLeft !== prevRepsLeft.current &&
      repsLeft !== undefined &&
      repsLeft > 0;

    if (hasSingularChanged || hasLeftChanged) {
      setAnimateLeft(true);
      const timer = setTimeout(() => setAnimateLeft(false), 400);
      return () => clearTimeout(timer);
    }
    prevTotalReps.current = totalReps;
    prevRepsLeft.current = repsLeft;
  }, [totalReps, repsLeft, isAlternating]);

  // Right Animation
  useEffect(() => {
    if (
      repsRight !== prevRepsRight.current &&
      repsRight !== undefined &&
      repsRight > 0
    ) {
      setAnimateRight(true);
      const timer = setTimeout(() => setAnimateRight(false), 400);
      return () => clearTimeout(timer);
    }
    prevRepsRight.current = repsRight;
  }, [repsRight]);

  // --- Drag Logic ---

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setIsDraggingThreshold(true);
  };

  useEffect(() => {
    const handleMove = (clientY: number) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      // 0 at top, 100 at bottom (DOM coords) -> Invert for percentage (0 bottom, 100 top)
      const rawPercentage = (relativeY / rect.height) * 100;
      const invertedPercentage = 100 - rawPercentage;

      onThresholdChange(Math.max(0, Math.min(100, invertedPercentage)));
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingThreshold) handleMove(e.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isDraggingThreshold) handleMove(e.touches[0].clientY);
    };

    const onEnd = () => setIsDraggingThreshold(false);

    if (isDraggingThreshold) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onEnd);
      window.addEventListener('touchmove', onTouchMove);
      window.addEventListener('touchend', onEnd);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isDraggingThreshold, onThresholdChange]);

  return (
    <div className="relative w-full h-full flex flex-col justify-center items-center">
      {/* 1. Header: Alternating Rep Counts */}
      {isAlternating && (
        <div className="flex gap-6 w-full justify-center mb-1">
          <div className="w-32 sm:w-40 text-center">
            <span
              className={`text-4xl font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
            >
              {repsLeft || 0}
            </span>
          </div>
          <div className="w-32 sm:w-40 text-center">
            <span
              className={`text-4xl font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
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
        <MachineSlider
          ref={containerRef} // This ref is used for drag calculations
          position={handlePosition}
          threshold={thresholdPosition}
          theme={theme}
          animate={animateLeft}
          onThresholdDragStart={handleDragStart}
        />

        {/* Right Slider (Optional) */}
        {isAlternating && (
          <MachineSlider
            ref={null} // We don't need a second ref for calculation
            position={handlePositionRight || 0}
            threshold={thresholdPosition}
            theme={theme}
            animate={animateRight}
            onThresholdDragStart={handleDragStart}
          />
        )}
      </div>
    </div>
  );
}
