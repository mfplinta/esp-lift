import React, { useState, useEffect } from 'react';
import { useStore } from '../store';

export default function DebugPanel() {
  const [fps, setFps] = useState(0);
  const [lastTime, setLastTime] = useState(performance.now());
  const [windowSize, setWindowSize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });
  const lastMovementMs = useStore((s) =>
    (Date.now() - s.lastMovementTime).toString().padStart(7)
  );

  useEffect(() => {
    let frameId: number;
    const update = () => {
      const now = performance.now();
      setFps(Math.round(1000 / (now - lastTime)));
      setLastTime(now);
      setWindowSize({ width: innerWidth, height: innerHeight });
      frameId = requestAnimationFrame(update);
    };

    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [lastTime]);

  return (
    <div className="fixed bottom-2 left-2 z-[9999] pointer-events-none flex flex-col items-end font-mono text-xs text-red-600 bg-transparent p-2">
      <div className="bg-red-600/10 p-2 border border-red-600/20 backdrop-blur-[4px] rounded-md pointer-events-auto">
        <h3 className="font-bold uppercase mb-1 border-b border-red-600/30 text-right">
          Debug Console
        </h3>

        <table className="table-auto border-collapse">
          <tbody>
            <tr>
              <td className="pr-2 text-right">FPS |</td>
              <td className="text-right">{fps}</td>
            </tr>

            <tr>
              <td className="pr-2 text-right whitespace-nowrap">
                Last message |
              </td>
              <td className="text-right whitespace-pre-wrap">
                {lastMovementMs} ms
              </td>
            </tr>

            <tr>
              <td className="pr-2 text-right">Window |</td>
              <td className="text-right">
                {typeof window !== 'undefined'
                  ? `${windowSize.width}x${windowSize.height}`
                  : 'N/A'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
