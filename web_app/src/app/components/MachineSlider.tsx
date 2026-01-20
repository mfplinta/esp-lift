import React, {
  forwardRef,
  useRef,
  useState,
  useEffect,
  useCallback,
} from 'react';

interface MachineSliderProps {
  position: number;
  threshold: number;
  theme: 'light' | 'dark';
  animate: boolean;
  onThresholdDragStart: (e: React.PointerEvent | PointerEvent) => void;
}

const MachineSlider = forwardRef<HTMLDivElement, MachineSliderProps>(
  ({ position, threshold, theme, animate, onThresholdDragStart }, ref) => {
    const innerRef = useRef<HTMLDivElement | null>(null);

    // Sync external ref with internal ref
    useEffect(() => {
      if (!ref) return;
      if (typeof ref === 'function') {
        ref(innerRef.current);
      } else {
        (ref as React.RefObject<HTMLDivElement | null>).current =
          innerRef.current;
      }
    }, [ref]);

    const [isNear, setIsNear] = useState<boolean>(false);
    const [isDragging, setIsDragging] = useState(false);

    // Dimensions
    const baseLinePx = 5;
    const expandedLinePx = 20;
    const proximityPx = 25;

    const computeProximity = useCallback(
      (clientY: number) => {
        const el = innerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const thresholdBottomPx = rect.height * (threshold / 100);
        const thresholdCenterY = rect.bottom - thresholdBottomPx;
        const dist = Math.abs(clientY - thresholdCenterY);
        return dist <= proximityPx;
      },
      [threshold]
    );

    const handlePointerMove = (e: React.PointerEvent) => {
      if (isDragging) return;
      const near = computeProximity(e.clientY);
      setIsNear(!!near);
    };

    const handleLeave = () => {
      if (!isDragging) setIsNear(false);
    };

    const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);

      setIsDragging(true);
      setIsNear(true);
      onThresholdDragStart(e);
    };

    const handleDragEnd = () => {
      setIsDragging(false);
      setIsNear(false);
    };

    useEffect(() => {
      window.addEventListener('pointerup', handleDragEnd);
      window.addEventListener('pointercancel', handleDragEnd);
      return () => {
        window.removeEventListener('pointerup', handleDragEnd);
        window.removeEventListener('pointercancel', handleDragEnd);
      };
    }, []);

    const active = isNear || isDragging;
    const visibleLinePx = active ? expandedLinePx : baseLinePx;
    const hitboxPx = visibleLinePx + proximityPx * 2;

    // Theme Styles
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
        ref={innerRef}
        className="relative h-full w-32 sm:w-40 rounded-3xl overflow-hidden select-none"
        onPointerMove={handlePointerMove}
        onMouseLeave={handleLeave}
        style={{ touchAction: 'none' }}
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

        {/* 4. Draggable Threshold */}
        <div
          className="absolute w-full cursor-grab active:cursor-grabbing z-20"
          onPointerDown={handleDragStart}
          style={{
            bottom: `${threshold}%`,
            transform: 'translateY(50%)',
            height: `${hitboxPx}px`,
            touchAction: 'none',
          }}
        >
          <div
            className={`${thresholdColor} shadow-lg rounded-full mx-0 relative pointer-events-none`}
            style={{
              height: `${visibleLinePx}px`,
              transition: 'height 160ms ease',
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          >
            {/* Dots */}
            <div className="absolute inset-0 flex items-center justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full ${dotColor}`}
                  style={{ transform: 'translateY(0.5px)' }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 5. Visual Extensions */}
        <div
          className={`absolute ${thresholdColor} z-20 shadow-lg rounded-l-full pointer-events-none`}
          style={{
            bottom: `${threshold}%`,
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
            bottom: `${threshold}%`,
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
);

export default MachineSlider;
