import { ChevronDown, Dumbbell, Eye, EyeOff, Wifi, X } from 'lucide-react'; // Added Activity icon
import { Switch } from '@/app/components/ui/switch';
import { Label } from '@/app/components/ui/label';
import { useState } from 'react';
import { shallowEqual } from 'react-redux';
import { setConfig, useAppDispatch, useAppSelector } from '../store';
import { HardwareConfig } from '../models';

interface ConfigModalProps {
  isOpen: boolean;
  hardwareSettings: HardwareConfig;
  onClose: () => void;
  onCalibrate?: () => void;
  onRestart?: () => void;
  onHardwareChange?: (settings: HardwareConfig) => void;
}

export default function ConfigModal({
  isOpen,
  hardwareSettings: hardwareSettings,
  onClose,
  onCalibrate,
  onRestart,
  onHardwareChange,
}: ConfigModalProps) {
  if (!isOpen) return null;

  const [networkOpen, setNetworkOpen] = useState(false);
  const [wifiSSID, setWifiSSID] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hostname, setHostname] = useState(hardwareSettings.network?.hostname);
  const [canApplyNetwork, setCanApplyNetwork] = useState(false);

  const [movementOpen, setMovementOpen] = useState(false);
  const [debounceInterval, setDebounceInterval] = useState(
    hardwareSettings.movement?.debounceInterval ?? 100
  );
  const [calibrationDebounceSteps, setCalibrationDebounceSteps] = useState(
    hardwareSettings.movement?.calibrationDebounceSteps ?? 25
  );

  const dispatch = useAppDispatch();
  const { config, isDarkMode } = useAppSelector(
    (s) => ({
      config: s.machine.config,
      isDarkMode: s.machine.config.theme === 'dark',
    }),
    shallowEqual
  );

  const autoCompleteEnabled = !!(
    config.autoCompleteSecs && config.autoCompleteSecs !== 0
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md rounded-2xl shadow-2xl ${
          isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-black'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between p-6 border-b ${
            isDarkMode ? 'border-gray-800' : 'border-gray-200'
          }`}
        >
          <h2 className="text-2xl font-bold">Settings</h2>
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

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* App Settings Section */}
          <div className="space-y-4">
            <h3
              className={`text-lg font-bold ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}
            >
              App
            </h3>

            {/* Strict Mode */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="strict-mode"
                    className="text-base font-semibold"
                  >
                    Strict Mode
                  </Label>
                  <p
                    className={`text-sm mt-1 ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}
                  >
                    Count reps only when the handle passes the green threshold
                    line
                  </p>
                </div>
                <Switch
                  id="strict-mode"
                  checked={config.strictMode}
                  onCheckedChange={(checked) =>
                    dispatch(setConfig({ strictMode: checked }))
                  }
                  className="ml-4"
                />
              </div>
            </div>

            {/* Auto-Set Completion */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label htmlFor="auto-set" className="text-base font-semibold">
                    Auto-Complete Set
                  </Label>
                  <p
                    className={`text-sm mt-1 ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}
                  >
                    Automatically complete the set after a period of inactivity
                  </p>
                </div>
                <Switch
                  id="auto-set"
                  checked={autoCompleteEnabled}
                  onCheckedChange={(checked) =>
                    dispatch(
                      setConfig({
                        autoCompleteSecs: checked
                          ? config.autoCompleteSecs || 10
                          : 0,
                      })
                    )
                  }
                  className="ml-4"
                />
              </div>

              {/* Timeout Setting */}
              {autoCompleteEnabled && (
                <div className="pt-2">
                  <Label htmlFor="timeout" className="text-sm font-medium">
                    Inactivity Timeout: {config.autoCompleteSecs}s
                  </Label>
                  <input
                    id="timeout"
                    type="range"
                    min="5"
                    max="60"
                    step="5"
                    value={config.autoCompleteSecs}
                    onChange={(e) =>
                      dispatch(
                        setConfig({
                          autoCompleteSecs: Number(e.target.value),
                        })
                      )
                    }
                    className={`w-full mt-2 h-2 rounded-lg appearance-none cursor-pointer ${
                      isDarkMode ? 'bg-gray-700' : 'bg-gray-300'
                    } [&::-webkit-slider-thumb]:appearance-none
                      [&::-webkit-slider-thumb]:h-4
                      [&::-webkit-slider-thumb]:w-4
                      [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-current
                      [&::-webkit-slider-thumb]:transition-transform
                      [&::-webkit-slider-thumb]:duration-150
                      active:[&::-webkit-slider-thumb]:scale-125
                      `}
                  />
                  <div className="flex justify-between mt-1">
                    <span
                      className={`text-xs ${
                        isDarkMode ? 'text-gray-500' : 'text-gray-400'
                      }`}
                    >
                      5s
                    </span>
                    <span
                      className={`text-xs ${
                        isDarkMode ? 'text-gray-500' : 'text-gray-400'
                      }`}
                    >
                      60s
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Label
                      htmlFor="auto-set"
                      className="text-base font-semibold"
                    >
                      Debug Mode
                    </Label>
                    <p
                      className={`text-sm mt-1 ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}
                    >
                      Show debug information and diagnostics
                    </p>
                  </div>
                  <Switch
                    id="auto-set"
                    checked={config.debugMode}
                    onCheckedChange={(checked) =>
                      dispatch(setConfig({ debugMode: checked }))
                    }
                    className="ml-4 "
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section Divider */}
          <div
            className={`border-t-2 ${
              isDarkMode ? 'border-gray-700' : 'border-gray-300'
            }`}
          />

          {/* Hardware Section */}
          <div className="space-y-4">
            <h3
              className={`text-lg font-bold ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}
            >
              Hardware
            </h3>

            <div className="flex gap-2">
              <button
                onClick={onCalibrate}
                className={`py-2 px-4 rounded font-semibold border transition-all ${
                  isDarkMode
                    ? 'bg-white text-blue-600 border-blue-600 hover:bg-blue-100'
                    : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-400'
                }`}
              >
                Calibrate
              </button>

              <button
                onClick={onRestart}
                className={`py-2 px-4 rounded font-semibold border transition-all ${
                  isDarkMode
                    ? 'bg-white text-red-700 border-red-700 hover:bg-red-100'
                    : 'bg-red-700 text-white border-red-700 hover:bg-red-400'
                }`}
              >
                Restart
              </button>
            </div>
          </div>

          {/* Movement Settings */}
          <div className="space-y-2">
            <button
              onClick={() => setMovementOpen((v) => !v)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                isDarkMode
                  ? 'border-gray-700 hover:bg-gray-800'
                  : 'border-gray-300 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <Dumbbell size={18} />
                <span className="font-semibold">Movement</span>
              </div>
              <ChevronDown
                size={18}
                className={`transition-transform ${
                  movementOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {movementOpen && (
              <div
                className={`p-4 rounded-xl border shadow-inner space-y-4 ${
                  isDarkMode
                    ? 'bg-gray-800 border-gray-700'
                    : 'bg-gray-50 border-gray-300'
                }`}
              >
                <div className="space-y-1">
                  <Label className="text-sm font-medium">
                    Message debounce interval
                  </Label>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      placeholder="0"
                      min={0}
                      value={debounceInterval}
                      onChange={(e) =>
                        setDebounceInterval(Number(e.target.value))
                      }
                      className={`w-full pl-3 pr-12 py-2 rounded-lg border text-sm appearance-none ${
                        isDarkMode
                          ? 'bg-gray-900 border-gray-600 text-white placeholder-gray-500'
                          : 'bg-white border-gray-300 text-black placeholder-gray-400'
                      } [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                    />
                    <span
                      className={`absolute right-3 text-sm font-medium pointer-events-none ${
                        isDarkMode ? 'text-gray-500' : 'text-gray-400'
                      }`}
                    >
                      ms
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm font-medium">
                    Calibration debounce steps
                  </Label>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      placeholder="0"
                      min={0}
                      max={720}
                      step={1}
                      value={calibrationDebounceSteps}
                      onChange={(e) =>
                        setCalibrationDebounceSteps(Number(e.target.value))
                      }
                      className={`w-full pl-3 pr-16 py-2 rounded-lg border text-sm appearance-none ${
                        isDarkMode
                          ? 'bg-gray-900 border-gray-600 text-white placeholder-gray-500'
                          : 'bg-white border-gray-300 text-black placeholder-gray-400'
                      } [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                    />
                    <span
                      className={`absolute right-3 text-sm font-medium pointer-events-none ${
                        isDarkMode ? 'text-gray-500' : 'text-gray-400'
                      }`}
                    >
                      steps
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setMovementOpen(false);
                    onHardwareChange?.({
                      ...hardwareSettings,
                      movement: {
                        ...hardwareSettings.movement,
                        debounceInterval: debounceInterval,
                        calibrationDebounceSteps: calibrationDebounceSteps,
                      },
                    });
                  }}
                  className={`w-full py-2 rounded-lg font-semibold transition-all ${
                    isDarkMode
                      ? 'bg-white text-black hover:bg-gray-200'
                      : 'bg-black text-white hover:bg-gray-800'
                  }`}
                >
                  Apply Movement Settings
                </button>
              </div>
            )}
          </div>

          {/* Network Settings */}
          <div className="space-y-2">
            <button
              onClick={() => setNetworkOpen((v) => !v)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                isDarkMode
                  ? 'border-gray-700 hover:bg-gray-800'
                  : 'border-gray-300 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <Wifi size={18} />
                <span className="font-semibold">Network</span>
              </div>
              <ChevronDown
                size={18}
                className={`transition-transform ${
                  networkOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {networkOpen && (
              <div
                className={`p-4 rounded-xl border shadow-inner space-y-4 ${
                  isDarkMode
                    ? 'bg-gray-800 border-gray-700'
                    : 'bg-gray-50 border-gray-300'
                }`}
              >
                {/* SSID */}
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Wi-Fi SSID</Label>
                  <input
                    type="text"
                    placeholder="Enter network name"
                    value={wifiSSID}
                    onChange={(e) => {
                      setWifiSSID(e.target.value);
                      setCanApplyNetwork(true);
                    }}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${
                      config.theme === 'dark'
                        ? 'bg-gray-900 border-gray-600 text-white placeholder-gray-500'
                        : 'bg-white border-gray-300 text-black placeholder-gray-400'
                    }`}
                  />
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter password"
                      value={wifiPassword}
                      onChange={(e) => {
                        setWifiPassword(e.target.value);
                        setCanApplyNetwork(true);
                      }}
                      className={`w-full pl-3 pr-10 py-2 rounded-lg border text-sm ${
                        config.theme === 'dark'
                          ? 'bg-gray-900 border-gray-600 text-white placeholder-gray-500'
                          : 'bg-white border-gray-300 text-black placeholder-gray-400'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors ${
                        config.theme === 'dark'
                          ? 'text-gray-400 hover:bg-gray-700'
                          : 'text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Hostname */}
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Hostname</Label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Enter hostname"
                      value={hostname}
                      onChange={(e) => {
                        setHostname(e.target.value);
                        setCanApplyNetwork(true);
                      }}
                      className={`w-full pl-3 pr-10 py-2 rounded-lg border text-sm ${
                        config.theme === 'dark'
                          ? 'bg-gray-900 border-gray-600 text-white placeholder-gray-500'
                          : 'bg-white border-gray-300 text-black placeholder-gray-400'
                      }`}
                    />
                  </div>
                </div>

                {/* Apply */}
                <button
                  onClick={() => {
                    setNetworkOpen(false);
                    onHardwareChange?.({
                      ...hardwareSettings,
                      network: {
                        ...hardwareSettings.network,
                        ssid: wifiSSID,
                        password: wifiPassword,
                        hostname: hostname,
                      },
                    });
                  }}
                  disabled={!canApplyNetwork}
                  className={`w-full py-2 rounded-lg font-semibold transition-all ${!canApplyNetwork && 'cursor-not-allowed'} ${
                    !canApplyNetwork
                      ? isDarkMode
                        ? 'bg-white/60 text-black'
                        : 'bg-black/60 text-white'
                      : isDarkMode
                        ? 'bg-white text-black hover:bg-gray-200'
                        : 'bg-black text-white hover:bg-gray-800'
                  }`}
                >
                  Apply Network Settings
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className={`p-6 border-t ${
            isDarkMode ? 'border-gray-800' : 'border-gray-200'
          }`}
        >
          <button
            onClick={onClose}
            className={`w-full py-3 px-6 rounded-xl font-semibold transition-all ${
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
  );
}
