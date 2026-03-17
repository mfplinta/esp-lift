import { Clock, Repeat, Timer, Trash2 } from 'lucide-react';
import { SetRecord } from '../models';
import { useAppSelector } from '../store';

interface SetCardProps {
  record: SetRecord;
  formatTime: (seconds: number) => string;
  onDelete?: () => void;
}

export default function SetCard({
  record,
  formatTime,
  onDelete,
}: SetCardProps) {
  const isDarkMode = useAppSelector((s) => s.machine.config.theme === 'dark');

  const cardColor = isDarkMode ? 'bg-gray-800' : 'bg-white';
  const textColor = isDarkMode ? 'text-gray-400' : 'text-gray-600';

  return (
    <div className={`p-3 rounded-lg ${cardColor} group`}>
      <div className="flex justify-between items-center mb-1">
        <span
          className={`font-bold ${record.exerciseName === 'Rest' ? 'text-blue-500' : ''}`}
        >
          {record.exerciseName === 'Rest' ? 'Rest' : record.exerciseName}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs opacity-40">
            {new Date(record.timestamp).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
          {onDelete && (
            <button
              onClick={onDelete}
              className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                isDarkMode
                  ? 'hover:bg-red-900 text-red-300'
                  : 'hover:bg-red-100 text-red-600'
              }`}
              aria-label="Delete record"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
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
}

export function LiveRestCard({
  formatTime,
}: {
  formatTime: (s: number) => string;
}) {
  const isDarkMode = useAppSelector((s) => s.machine.config.theme === 'dark');
  const activeTime = useAppSelector((s) => s.machine.activeTime);

  const cardColor = isDarkMode ? 'bg-gray-800' : 'bg-white';
  const textColor = isDarkMode ? 'text-gray-400' : 'text-gray-600';

  return (
    <div className={`p-3 rounded-lg border border-blue-500/30 ${cardColor}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold text-blue-500">Rest</span>
        <span className="text-xs opacity-50">Now</span>
      </div>
      <div className="flex items-center gap-2">
        <Clock size={16} className={textColor} />
        <span className="text-lg">{formatTime(activeTime)}</span>
      </div>
    </div>
  );
}
