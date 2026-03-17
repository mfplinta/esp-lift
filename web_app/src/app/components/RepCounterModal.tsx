import { X, ChevronUp, ChevronDown, Bell } from 'lucide-react';
import { setRepTarget, useAppDispatch, useAppSelector } from '../store';
import { Switch } from './ui/switch';
import { useState } from 'react';
import { shallowEqual } from 'react-redux';

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
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export default function RepCounterModal({
  isOpen,
  onClose,
}: RepCounterModalProps) {
  const { isDarkMode, repTarget } = useAppSelector(
    (s) => ({
      isDarkMode: s.machine.config.theme === 'dark',
      repTarget: s.machine.repTarget,
    }),
    shallowEqual
  );

  const dispatch = useAppDispatch();
  const update = (partial: Partial<RepTargetConfig>) =>
    dispatch(setRepTarget({ ...repTarget, ...partial }));

  if (!isOpen) return null;

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
            <Switch
              checked={repTarget.enabled}
              onCheckedChange={(checked) => update({ enabled: !!checked })}
              className="ml-4"
            />
          </label>

          {repTarget.enabled && (
            <div className="grid grid-cols-2 gap-4">
              <CounterField
                label="Sets"
                value={repTarget.sets}
                onChange={(value) => update({ sets: value })}
                min={1}
                max={50}
                isDarkMode={isDarkMode}
              />
              <CounterField
                label="Reps"
                value={repTarget.reps}
                onChange={(value) => update({ reps: value })}
                min={1}
                max={200}
                isDarkMode={isDarkMode}
              />
            </div>
          )}

          <label className="flex items-center justify-between">
            <span className="text-base font-semibold">Enable rest timer</span>
            <Switch
              checked={repTarget.restEnabled}
              onCheckedChange={(checked) => update({ restEnabled: !!checked })}
              className="ml-4"
            />
          </label>

          {repTarget.restEnabled && (
            <div className="grid grid-cols-2 gap-4">
              <CounterField
                label="Minutes"
                value={repTarget.restMinutes}
                onChange={(value) => update({ restMinutes: value })}
                min={0}
                max={59}
                rollOnMinMax={true}
                isDarkMode={isDarkMode}
              />
              <CounterField
                label="Seconds"
                value={repTarget.restSeconds}
                onChange={(value) => update({ restSeconds: value })}
                min={0}
                max={59}
                rollOnMinMax={true}
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
  rollOnMinMax,
  isDarkMode,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  rollOnMinMax?: boolean;
  isDarkMode: boolean;
}) {
  const changeValue = (val: number) => {
    if (rollOnMinMax) {
      if (val > max) {
        onChange(min);
      } else if (val < min) {
        onChange(max);
      } else {
        onChange(val);
      }
    } else {
      onChange(clamp(val, min, max));
    }
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-sm font-semibold uppercase tracking-wider opacity-70">
        {label}
      </div>
      <div className="flex flex-col items-center w-full gap-2">
        <button
          onClick={() => changeValue(value + 1)}
          className={`w-full py-1 rounded-lg text-base font-semibold shadow transition-transform hover:scale-105 ${
            isDarkMode
              ? 'bg-gray-800 text-white hover:bg-gray-700'
              : 'bg-gray-100 text-black hover:bg-gray-200'
          }`}
          aria-label={`Increase ${label}`}
        >
          <ChevronUp size={22} className="mx-auto" />
        </button>
        <div className="flex items-center justify-center w-full">
          <input
            type="number"
            min={min - 1}
            max={max + 1}
            value={value}
            onChange={(e) => changeValue(e.target.valueAsNumber)}
            className={`w-full text-center text-3xl font-bold rounded-xl border px-6 py-1.5 appearance-none focus:outline-none hide-number-spin ${
              isDarkMode
                ? 'bg-gray-900 border-gray-700 text-white'
                : 'bg-white border-gray-300 text-black'
            }`}
            style={{ MozAppearance: 'textfield', paddingLeft: '1.5rem' }}
          />
        </div>
        <button
          onClick={() => changeValue(value - 1)}
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
    </div>
  );
}
