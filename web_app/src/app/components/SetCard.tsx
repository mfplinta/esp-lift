import { Clock, Repeat, Timer } from 'lucide-react';
import { SetRecord } from '../models';
import { useStore } from '../store';

interface SetCardProps {
  record: SetRecord;
  formatTime: (seconds: number) => string;
}

export default function SetCard({ record, formatTime }: SetCardProps) {
  const isDarkMode = useStore((s) => s.config.theme === 'dark');

  const cardColor = isDarkMode ? 'bg-gray-800' : 'bg-white';
  const textColor = isDarkMode ? 'text-gray-400' : 'text-gray-600';

  return (
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
}

export function LiveRestCard({
  formatTime,
}: {
  formatTime: (s: number) => string;
}) {
  const isDarkMode = useStore((s) => s.config.theme === 'dark');
  const activeTime = useStore((s) => s.activeTime);

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
