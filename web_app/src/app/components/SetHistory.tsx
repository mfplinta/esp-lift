import { useState, useEffect } from 'react';
import {
  Menu,
  Download,
  History,
  Trash2,
  ChevronLeft,
  X,
  BarChart3,
  Repeat,
  Timer,
} from 'lucide-react';
import { SetRecord } from '../models';
import { shallowEqual } from 'react-redux';
import {
  clearAllHistory,
  clearHistoryForDate,
  useAppDispatch,
  useAppSelector,
} from '../store';
import SetCard, { LiveRestCard } from './SetCard';

export default function SetHistory() {
  const MIN_PANEL_WIDTH = 200;
  const MAX_PANEL_WIDTH = 280;
  const [width, setWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [view, setView] = useState<'active' | 'days' | 'day-detail' | 'totals'>(
    'active'
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [todayStr, setTodayStr] = useState(new Date().toDateString());

  const dispatch = useAppDispatch();
  const { isResting, history, isDarkMode, selectedUser } = useAppSelector(
    (s) => ({
      isResting: s.machine.isResting,
      history: s.machine.history,
      isDarkMode: s.machine.config.theme === 'dark',
      selectedUser: s.machine.selectedUser,
    }),
    shallowEqual
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX - 24;
      const clamped = Math.max(
        MIN_PANEL_WIDTH,
        Math.min(newWidth, MAX_PANEL_WIDTH)
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
    downloadAnchorNode.remove();
    setIsMenuOpen(false);
  };

  const clearToday = () => {
    if (!selectedUser) return;
    if (window.confirm("Clear today's workout?")) {
      dispatch(clearHistoryForDate(todayStr, selectedUser.name));
      setView('active');
      setIsMenuOpen(false);
    }
  };

  const clearAll = () => {
    if (!selectedUser) return;
    if (window.confirm('Delete all history? This cannot be undone.')) {
      dispatch(clearAllHistory(selectedUser.name));
      setView('active');
      setIsMenuOpen(false);
    }
  };

  const filteredHistory = selectedUser
    ? history.filter((r) => r.userName === selectedUser.name)
    : [];
  const activeHistory = filteredHistory.filter(
    (r) => new Date(r.timestamp).toDateString() === todayStr
  );

  const groupedByDate = filteredHistory.reduce(
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = new Date().toDateString();
      if (next !== todayStr) {
        setTodayStr(next);
        setView('active');
        setSelectedDate(null);
      }
    }, 60000);

    return () => window.clearInterval(timer);
  }, [todayStr]);

  const totalsByExercise = filteredHistory.reduce(
    (
      acc: Record<string, { reps: number; duration: number; sets: number }>,
      record
    ) => {
      if (record.reps <= 0) return acc;
      const name = record.exerciseName || 'Unknown';
      if (!acc[name]) {
        acc[name] = { reps: 0, duration: 0, sets: 0 };
      }
      acc[name].reps += record.reps;
      acc[name].duration += record.duration;
      acc[name].sets += 1;
      return acc;
    },
    {}
  );

  const totalsList = Object.entries(totalsByExercise).sort(
    (a, b) => b[1].reps - a[1].reps
  );

  const bgColor = isDarkMode ? 'bg-gray-900' : 'bg-gray-100';
  const cardColor = isDarkMode ? 'bg-gray-800' : 'bg-white';
  const borderColor = isDarkMode ? 'border-gray-800' : 'border-gray-200';

  return (
    <div
      className="absolute left-6 top-24 bottom-6 hidden md:block overflow-hidden"
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
                  setView(
                    view === 'day-detail'
                      ? 'days'
                      : view === 'totals'
                        ? 'active'
                        : 'active'
                  )
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
                  : view === 'totals'
                    ? 'Totals'
                    : selectedDate}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                setView((current) =>
                  current === 'totals' ? 'active' : 'totals'
                )
              }
              className={`p-1 rounded transition-colors ${
                view === 'totals' ? 'bg-blue-500/20' : 'hover:bg-black/10'
              }`}
              aria-label="View totals"
            >
              <BarChart3 size={18} />
            </button>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-1 hover:bg-black/10 rounded transition-colors"
            >
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

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
                onClick={clearToday}
                className="w-full flex items-center gap-3 p-3 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={16} /> Clear
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {!selectedUser && view !== 'totals' && (
            <div className="text-sm opacity-60">
              Please select a user to save sets.
            </div>
          )}
          {view === 'totals' && (
            <div className="space-y-3">
              {!selectedUser && (
                <div className="text-sm opacity-60">
                  Select a user to view totals.
                </div>
              )}
              {selectedUser && totalsList.length === 0 && (
                <div className="text-sm opacity-60">No reps logged yet.</div>
              )}
              {selectedUser &&
                totalsList.map(([name, total]) => (
                  <div
                    key={name}
                    className={`p-3 rounded-lg border ${borderColor} ${cardColor}`}
                  >
                    <div className="text-sm font-medium">{name}</div>
                    <div className="flex items-center gap-3 text-sm mt-2">
                      <div className="flex items-center gap-1">
                        <Repeat size={14} className="opacity-60" />
                        <span>{total.reps}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Timer size={14} className="opacity-60" />
                        <span>{formatTime(total.duration)}</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
          {view === 'active' && (
            <>
              {selectedUser && isResting && (
                <LiveRestCard formatTime={formatTime} />
              )}
              {selectedUser &&
                [...activeHistory]
                  .reverse()
                  .map((record, i) => (
                    <SetCard key={i} record={record} formatTime={formatTime} />
                  ))}
              {selectedUser && activeHistory.length === 0 && !isResting && (
                <EmptyState />
              )}
            </>
          )}

          {view === 'days' && (
            <div className="space-y-2">
              {selectedUser &&
                dates.map((date) => (
                  <div
                    key={date}
                    className={`w-full p-3 rounded-lg text-left transition-colors border ${borderColor} ${cardColor} hover:border-blue-500/50 flex items-center justify-between gap-2`}
                  >
                    <button
                      onClick={() => {
                        setSelectedDate(date);
                        setView('day-detail');
                      }}
                      className="flex-1 text-left"
                    >
                      <div className="font-bold text-sm">
                        {date === todayStr ? 'Today' : date}
                      </div>
                      <div className="text-xs opacity-50">
                        {groupedByDate[date].length} sets completed
                      </div>
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        if (
                          window.confirm(
                            `Clear workouts for ${date === todayStr ? 'today' : date}?`
                          )
                        ) {
                          dispatch(
                            clearHistoryForDate(date, selectedUser.name)
                          );
                          setSelectedDate(null);
                          setView('days');
                        }
                      }}
                      className={`p-2 rounded-lg transition-colors ${
                        isDarkMode
                          ? 'hover:bg-red-900 text-red-300'
                          : 'hover:bg-red-100 text-red-600'
                      }`}
                      aria-label={`Clear ${date}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              {selectedUser && dates.length === 0 && <EmptyState />}
              {selectedUser && dates.length > 0 && (
                <button
                  onClick={clearAll}
                  className={`w-full mt-4 py-2 px-4 rounded-lg font-semibold transition-colors ${
                    isDarkMode
                      ? 'bg-red-500/20 text-red-200 hover:bg-red-500/30'
                      : 'bg-red-100 text-red-700 hover:bg-red-200'
                  }`}
                >
                  Clear All
                </button>
              )}
            </div>
          )}

          {view === 'day-detail' && selectedDate && (
            <div className="space-y-3">
              {selectedUser &&
                [...groupedByDate[selectedDate]]
                  .reverse()
                  .map((record, i) => (
                    <SetCard key={i} record={record} formatTime={formatTime} />
                  ))}
            </div>
          )}
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

const EmptyState = () => (
  <div className="text-center opacity-40 text-sm mt-10">No records found</div>
);
