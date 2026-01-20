import {
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
  CSSProperties,
} from 'react';
import {
  Timer,
  Repeat,
  Clock,
  Menu,
  Download,
  History,
  Trash2,
  ChevronLeft,
  X,
} from 'lucide-react';

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

const STORAGE_KEY = 'workout_history_records';

const SetHistory = forwardRef<SetHistoryHandle, SetHistoryProps>(
  ({ theme, isResting, currentRestTime, currentSetTime, setCount }, ref) => {
    const [history, setHistory] = useState<SetRecord[]>(() => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          return [];
        }
      }
      return [];
    });

    const [width, setWidth] = useState(256);
    const [isResizing, setIsResizing] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [view, setView] = useState<'active' | 'days' | 'day-detail'>(
      'active'
    );
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    useEffect(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    }, [history]);

    useImperativeHandle(ref, () => ({
      addRecord: (record) => {
        setHistory((prev) => [...prev, record]);
      },
      clearHistory: () => {
        setHistory([]);
      },
    }));

    useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing) return;
        const newWidth = e.clientX - 24;
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

    const downloadJSON = () => {
      const dataStr =
        'data:text/json;charset=utf-8,' +
        encodeURIComponent(JSON.stringify(history, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute('href', dataStr);
      downloadAnchorNode.setAttribute(
        'download',
        `workouts_${new Date().toISOString().split('T')[0]}.json`
      );
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      setIsMenuOpen(false);
    };

    const clearAll = () => {
      if (window.confirm('Delete all history? This cannot be undone.')) {
        setHistory([]);
        setView('active');
        setIsMenuOpen(false);
      }
    };

    const todayStr = new Date().toDateString();
    const activeHistory = history.filter(
      (r) => new Date(r.timestamp).toDateString() === todayStr
    );

    const groupedByDate = history.reduce(
      (acc: Record<string, SetRecord[]>, record) => {
        const date = new Date(record.timestamp).toDateString();
        if (!acc[date]) acc[date] = [];
        acc[date].push(record);
        return acc;
      },
      {}
    );

    const dates = Object.keys(groupedByDate).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    );

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
          <div className="p-4 border-b border-opacity-50 shrink-0 flex justify-between items-center relative z-[60]">
            <div className="flex items-center gap-2">
              {view !== 'active' && (
                <button
                  onClick={() =>
                    setView(view === 'day-detail' ? 'days' : 'active')
                  }
                  className="p-1 hover:bg-black/10 rounded"
                >
                  <ChevronLeft size={18} />
                </button>
              )}
              <h3 className="font-bold text-lg">
                {view === 'active'
                  ? 'Set History'
                  : view === 'days'
                    ? 'Past Days'
                    : selectedDate}
              </h3>
            </div>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-1 hover:bg-black/10 rounded transition-colors"
            >
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            {isMenuOpen && (
              <div
                className={`absolute top-full right-4 mt-1 w-48 rounded-xl border shadow-xl z-[70] overflow-hidden ${cardColor} ${borderColor}`}
              >
                <button
                  onClick={downloadJSON}
                  className="w-full flex items-center gap-3 p-3 text-sm hover:bg-blue-500/10 transition-colors border-b border-opacity-50"
                >
                  <Download size={16} /> Download JSON
                </button>
                <button
                  onClick={() => {
                    setView('days');
                    setIsMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 p-3 text-sm hover:bg-blue-500/10 transition-colors border-b border-opacity-50"
                >
                  <History size={16} /> View Past Workouts
                </button>
                <button
                  onClick={clearAll}
                  className="w-full flex items-center gap-3 p-3 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={16} /> Clear All
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {view === 'active' && (
              <>
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
                      <span className="text-lg">
                        {formatTime(currentRestTime)}
                      </span>
                    </div>
                  </div>
                )}
                {[...activeHistory].reverse().map((record, i) => (
                  <RecordCard
                    key={i}
                    record={record}
                    cardColor={cardColor}
                    textColor={textColor}
                    formatTime={formatTime}
                  />
                ))}
                {activeHistory.length === 0 && !isResting && <EmptyState />}
              </>
            )}

            {view === 'days' && (
              <div className="space-y-2">
                {dates.map((date) => (
                  <button
                    key={date}
                    onClick={() => {
                      setSelectedDate(date);
                      setView('day-detail');
                    }}
                    className={`w-full p-3 rounded-lg text-left transition-colors border ${borderColor} ${cardColor} hover:border-blue-500/50`}
                  >
                    <div className="font-bold text-sm">
                      {date === todayStr ? 'Today' : date}
                    </div>
                    <div className="text-xs opacity-50">
                      {groupedByDate[date].length} sets completed
                    </div>
                  </button>
                ))}
                {dates.length === 0 && <EmptyState />}
              </div>
            )}

            {view === 'day-detail' && selectedDate && (
              <div className="space-y-3">
                {[...groupedByDate[selectedDate]].reverse().map((record, i) => (
                  <RecordCard
                    key={i}
                    record={record}
                    cardColor={cardColor}
                    textColor={textColor}
                    formatTime={formatTime}
                  />
                ))}
              </div>
            )}
          </div>

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
                fontSize: 'clamp(24px, calc(var(--card-w) * 0.18), 80px)',
                marginBottom: '0.2em',
              }}
            >
              Sets: {setCount}
            </div>
            <div
              className="font-bold text-center whitespace-nowrap leading-none"
              style={{
                fontSize: 'clamp(32px, calc(var(--card-w) * 0.22), 110px)',
              }}
            >
              {currentSetTime.toFixed(1)}s
            </div>
          </div>

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

const RecordCard = ({ record, cardColor, textColor, formatTime }: any) => (
  <div className={`p-3 rounded-lg ${cardColor}`}>
    <div className="flex justify-between items-start mb-1">
      <div>
        <span
          className={`font-bold ${record.setNumber === 0 ? 'text-blue-500' : ''}`}
        >
          {record.setNumber === 0 ? 'Rest' : `Set ${record.setNumber}`}
        </span>
        {record.setNumber > 0 && (
          <div className="text-xs opacity-60">{record.exerciseName}</div>
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
);

const EmptyState = () => (
  <div className="text-center opacity-40 text-sm mt-10">No records found</div>
);

export default SetHistory;
