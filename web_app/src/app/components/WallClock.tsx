import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

export default function WallClock() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 font-semibold text-2xl select-none">
      <Clock size={24} />
      {currentTime.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      })}
    </div>
  );
}