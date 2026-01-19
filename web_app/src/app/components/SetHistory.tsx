import {
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
  CSSProperties,
} from 'react';
import { Timer, Repeat, Clock } from 'lucide-react';

export interface SetRecord {
  setNumber: number;
  reps: number;
  duration: number;
  timestamp: number;
  exerciseName: string;
}

interface SetHistoryProps {
  theme: 'light' | 'dark';
  isResting: boolean;
  currentRestTime: number;
  currentSetTime: number;
  setCount: number;
}

export interface SetHistoryHandle {
  addRecord: (record: SetRecord) => void;
  clearHistory: () => void;
}

const SetHistory = forwardRef<SetHistoryHandle, SetHistoryProps>(
  ({ theme, isResting, currentRestTime, currentSetTime, setCount }, ref) => {
    const [history, setHistory] = useState<SetRecord[]>([]);
    const [width, setWidth] = useState(256); // Default w-64
    const [isResizing, setIsResizing] = useState(false);

    useImperativeHandle(ref, () => ({
      addRecord: (record) => {
        setHistory((prev) => [...prev, record]);
      },
      clearHistory: () => {
        setHistory([]);
      },
    }));

    // Resize Logic
    useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing) return;
        const newWidth = e.clientX - 24; // Offset for left padding
        // Constraints: Min 200px, Max 1/3 screen
        const clamped = Math.max(
          200,
          Math.min(newWidth, window.innerWidth / 3)
        );
        setWidth(clamped);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      if (isResizing) {
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      }

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }, [isResizing]);

    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const bgColor = theme === 'dark' ? 'bg-gray-900' : 'bg-gray-100';
    const cardColor = theme === 'dark' ? 'bg-gray-800' : 'bg-white';
    const borderColor =
      theme === 'dark' ? 'border-gray-800' : 'border-gray-200';
    const textColor = theme === 'dark' ? 'text-gray-400' : 'text-gray-600';

    return (
      <div
        className="absolute left-6 top-24 bottom-6 hidden lg:block overflow-hidden"
        style={{ width: `${width}px` }}
      >
        <div
          className={`h-full flex flex-col rounded-2xl relative border ${bgColor} ${borderColor}`}
        >
          {/* Header */}
          <div className="p-4 border-b border-opacity-50 shrink-0">
            <h3 className="font-bold text-lg">Set History</h3>
          </div>

          {/* List Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {/* 1. CURRENT REST (Only visible if isResting, not in history yet) */}
            {isResting && (
              <div
                className={`p-3 rounded-lg border border-blue-500/30 ${cardColor}`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-blue-500">Rest</span>
                  <span className="text-xs opacity-50">Now</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={16} className={textColor} />
                  <span className="text-lg">{formatTime(currentRestTime)}</span>
                </div>
              </div>
            )}

            {/* 2. HISTORY LIST (Reverse order) */}
            {[...history].reverse().map((record, i) => (
              <div
                key={`${record.timestamp}-${i}`}
                className={`p-3 rounded-lg ${cardColor}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <span
                      className={`font-bold ${record.setNumber === 0 ? 'text-blue-500' : ''}`}
                    >
                      {record.setNumber === 0
                        ? 'Rest'
                        : `Set ${record.setNumber}`}
                    </span>
                    {record.setNumber > 0 && (
                      <div className="text-xs opacity-60">
                        {record.exerciseName}
                      </div>
                    )}
                  </div>
                  <span className="text-xs opacity-40">
                    {new Date(record.timestamp).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className="flex gap-3 text-sm mt-2">
                  {record.reps > 0 && (
                    <div className="flex items-center gap-1">
                      <Repeat size={14} className={textColor} />
                      <span>{record.reps}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Timer size={14} className={textColor} />
                    <span>{formatTime(record.duration)}</span>
                  </div>
                </div>
              </div>
            ))}

            {history.length === 0 && !isResting && (
              <div className="text-center opacity-40 text-sm mt-10">
                No sets completed yet
              </div>
            )}
          </div>

          {/* Bottom Summary / Current Timer - Dynamic Resizing */}
          <div
            className={`flex-shrink-0 border-t ${borderColor}`}
            style={
              {
                padding: 'clamp(8px, 4%, 20px)',
                '--card-w': `${width}px`,
              } as CSSProperties
            }
          >
            <div
              className={`font-bold text-center whitespace-nowrap leading-none ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}
              style={{
                // Scale font between 24px and 80px based on container width
                fontSize: 'clamp(24px, calc(var(--card-w) * 0.18), 80px)',
                marginBottom: '0.2em',
              }}
            >
              Sets: {setCount}
            </div>
            <div
              className="font-bold text-center whitespace-nowrap leading-none"
              style={{
                // Scale font between 32px and 110px based on container width
                fontSize: 'clamp(32px, calc(var(--card-w) * 0.22), 110px)',
              }}
            >
              {currentSetTime.toFixed(1)}s
            </div>
          </div>

          {/* Resize Handle */}
          <div
            className="absolute top-0 right-0 bottom-0 w-3 cursor-ew-resize hover:bg-blue-500/20 transition-colors z-50"
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
            }}
          />
        </div>
      </div>
    );
  }
);

export default SetHistory;
