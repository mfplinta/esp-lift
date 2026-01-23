import { useState, useEffect, CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Menu, Download, History, Trash2, ChevronLeft, X } from 'lucide-react';
import { SetRecord } from '../models';
import { useStore } from '../store';
import SetCard, { LiveRestCard } from './SetCard';

export default function SetHistory() {
  const [width, setWidth] = useState(256);
  const [isResizing, setIsResizing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [view, setView] = useState<'active' | 'days' | 'day-detail'>('active');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { isResting, history, isDarkMode, clearHistory } = useStore(
    useShallow((s) => ({
      sets: s.sets,
      isResting: s.isResting,
      history: s.history,
      isDarkMode: s.config.theme === 'dark',
      reset: s.reset,
      clearHistory: s.clearHistory,
    }))
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX - 24;
      const clamped = Math.max(200, Math.min(newWidth, window.innerWidth / 3));
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
      clearHistory();
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
              {isResting && <LiveRestCard formatTime={formatTime} />}
              {[...activeHistory].reverse().map((record, i) => (
                <SetCard key={i} record={record} formatTime={formatTime} />
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
