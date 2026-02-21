import { X, ChevronUp, ChevronDown, Bell } from 'lucide-react';
import { useAppSelector } from '../store';

export type RepTargetConfig = {
  enabled: boolean;
  reps: number;
  sets: number;
  restEnabled: boolean;
  restMinutes: number;
  restSeconds: number;
};

interface RepCounterModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: RepTargetConfig;
  onChange: (next: RepTargetConfig) => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export default function RepCounterModal({
  isOpen,
  onClose,
  target,
  onChange,
}: RepCounterModalProps) {
  const isDarkMode = useAppSelector((s) => s.machine.config.theme === 'dark');

  if (!isOpen) return null;

  const update = (partial: Partial<RepTargetConfig>) => {
    onChange({ ...target, ...partial });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`relative w-full max-w-md rounded-2xl shadow-2xl ${
          isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-black'
        }`}
      >
        <div
          className={`flex items-center justify-between p-4 border-b ${
            isDarkMode ? 'border-gray-800' : 'border-gray-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <Bell size={20} />
            <h2 className="text-2xl font-bold">Counter</h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-full transition-colors ${
              isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
            }`}
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-4 space-y-5">
          <label className="flex items-center justify-between">
            <span className="text-base font-semibold">Enable rep target</span>
            <input
              type="checkbox"
              checked={target.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
              className="h-5 w-5"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <CounterField
              label="Sets"
              value={target.sets}
              onChange={(value) => update({ sets: value })}
              min={1}
              max={50}
              isDarkMode={isDarkMode}
            />
            <CounterField
              label="Reps"
              value={target.reps}
              onChange={(value) => update({ reps: value })}
              min={1}
              max={200}
              isDarkMode={isDarkMode}
            />
          </div>

          <label className="flex items-center justify-between">
            <span className="text-base font-semibold">Enable rest timer</span>
            <input
              type="checkbox"
              checked={target.restEnabled}
              onChange={(e) => update({ restEnabled: e.target.checked })}
              className="h-5 w-5"
            />
          </label>

          {target.restEnabled && (
            <div className="grid grid-cols-2 gap-4">
              <TimeField
                label="Minutes"
                value={target.restMinutes}
                onChange={(value) => update({ restMinutes: value })}
                min={0}
                max={59}
                isDarkMode={isDarkMode}
              />
              <TimeField
                label="Seconds"
                value={target.restSeconds}
                onChange={(value) => update({ restSeconds: value })}
                min={0}
                max={59}
                isDarkMode={isDarkMode}
              />
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all ${
                isDarkMode
                  ? 'bg-white text-black hover:bg-gray-200'
                  : 'bg-black text-white hover:bg-gray-800'
              }`}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CounterField({
  label,
  value,
  onChange,
  min,
  max,
  isDarkMode,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  isDarkMode: boolean;
}) {
  const clamped = clamp(value, min, max);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-sm font-semibold uppercase tracking-wider opacity-70">
        {label}
      </div>
      <button
        onClick={() => onChange(clamp(clamped + 1, min, max))}
        className={`w-full py-1.5 rounded-xl text-xl font-semibold shadow-lg transition-transform hover:scale-105 ${
          isDarkMode
            ? 'bg-gray-800 text-white hover:bg-gray-700'
            : 'bg-gray-100 text-black hover:bg-gray-200'
        }`}
        aria-label={`Increase ${label}`}
      >
        <ChevronUp size={28} className="mx-auto" />
      </button>
      <input
        type="number"
        min={min}
        max={max}
        value={clamped}
        onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
        className={`w-full text-center text-3xl font-bold rounded-xl border px-3 py-1.5 ${
          isDarkMode
            ? 'bg-gray-900 border-gray-700 text-white'
            : 'bg-white border-gray-300 text-black'
        }`}
      />
      <button
        onClick={() => onChange(clamp(clamped - 1, min, max))}
        className={`w-full py-1.5 rounded-xl text-xl font-semibold shadow-lg transition-transform hover:scale-105 ${
          isDarkMode
            ? 'bg-gray-800 text-white hover:bg-gray-700'
            : 'bg-gray-100 text-black hover:bg-gray-200'
        }`}
        aria-label={`Decrease ${label}`}
      >
        <ChevronDown size={28} className="mx-auto" />
      </button>
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
  min,
  max,
  isDarkMode,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  isDarkMode: boolean;
}) {
  const clamped = clamp(value, min, max);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-sm font-semibold uppercase tracking-wider opacity-70">
        {label}
      </div>
      <button
        onClick={() => onChange(clamp(clamped + 1, min, max))}
        className={`w-full py-1 rounded-lg text-base font-semibold shadow transition-transform hover:scale-105 ${
          isDarkMode
            ? 'bg-gray-800 text-white hover:bg-gray-700'
            : 'bg-gray-100 text-black hover:bg-gray-200'
        }`}
        aria-label={`Increase ${label}`}
      >
        <ChevronUp size={22} className="mx-auto" />
      </button>
      <input
        type="number"
        min={min}
        max={max}
        value={clamped}
        onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
        className={`w-full text-center text-2xl font-semibold rounded-lg border px-2 py-1 ${
          isDarkMode
            ? 'bg-gray-900 border-gray-700 text-white'
            : 'bg-white border-gray-300 text-black'
        }`}
      />
      <button
        onClick={() => onChange(clamp(clamped - 1, min, max))}
        className={`w-full py-1 rounded-lg text-base font-semibold shadow transition-transform hover:scale-105 ${
          isDarkMode
            ? 'bg-gray-800 text-white hover:bg-gray-700'
            : 'bg-gray-100 text-black hover:bg-gray-200'
        }`}
        aria-label={`Decrease ${label}`}
      >
        <ChevronDown size={22} className="mx-auto" />
      </button>
    </div>
  );
}
