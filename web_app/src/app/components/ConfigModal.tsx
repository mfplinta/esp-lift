import { ChevronDown, Wifi, X } from 'lucide-react';
import { Switch } from '@/app/components/ui/switch';
import { Label } from '@/app/components/ui/label';
import { useState } from 'react';

export interface Config {
  strictMode: boolean;
  autoCompleteSecs: number;
}

interface ConfigModalProps {
  isOpen: boolean;
  theme: 'light' | 'dark';
  config: Config;
  onClose: () => void;
  onConfigChange: (newConfig: Config, autoSetEnabled: boolean) => void;
  onCalibrate?: () => void;
  onRestart?: () => void;
  onWifiChange?: (ssid: string, password: string) => void;
}

export default function ConfigModal({
  isOpen,
  theme,
  config,
  onClose,
  onConfigChange,
  onCalibrate,
  onRestart,
  onWifiChange,
}: ConfigModalProps) {
  if (!isOpen) return null;

  const autoCompleteEnabled = !!(
    config.autoCompleteSecs && config.autoCompleteSecs !== 0
  );

  const [wifiOpen, setWifiOpen] = useState(false);
  const [wifiSSID, setWifiSSID] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');

  // Helper to update individual fields
  const updateConfig = (key: keyof Config, value: any) => {
    onConfigChange({ ...config, [key]: value }, autoCompleteEnabled);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md rounded-2xl shadow-2xl ${
          theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-black'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between p-6 border-b ${
            theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
          }`}
        >
          <h2 className="text-2xl font-bold">Settings</h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-full transition-colors ${
              theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
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
                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
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
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
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
                    updateConfig('strictMode', checked)
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
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                    }`}
                  >
                    Automatically complete the set after a period of inactivity
                  </p>
                </div>
                <Switch
                  id="auto-set"
                  checked={autoCompleteEnabled}
                  onCheckedChange={(checked) =>
                    updateConfig(
                      'autoCompleteSecs',
                      checked ? config.autoCompleteSecs || 10 : 0
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
                      updateConfig('autoCompleteSecs', Number(e.target.value))
                    }
                    className={`w-full mt-2 h-2 rounded-lg appearance-none cursor-pointer ${
                      theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'
                    } [&::-webkit-slider-thumb]:appearance-none
                      [&::-webkit-slider-thumb]:h-4
                      [&::-webkit-slider-thumb]:w-4
                      [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-current
                      [&::-webkit-slider-thumb]:transition-transform
                      [&::-webkit-slider-thumb]:duration-150
                      active:[&::-webkit-slider-thumb]:scale-125
                      `}
                    style={{
                      accentColor: theme === 'dark' ? '#ffffff' : '#000000',
                    }}
                  />
                  <div className="flex justify-between mt-1">
                    <span
                      className={`text-xs ${
                        theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                      }`}
                    >
                      5s
                    </span>
                    <span
                      className={`text-xs ${
                        theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                      }`}
                    >
                      60s
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section Divider */}
          <div
            className={`border-t-2 ${
              theme === 'dark' ? 'border-gray-700' : 'border-gray-300'
            }`}
          />

          {/* Hardware Section */}
          <div className="space-y-4">
            <h3
              className={`text-lg font-bold ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
              }`}
            >
              Hardware
            </h3>

            {/* Calibrate Button */}
            <button
              onClick={onCalibrate}
              className={`py-2 px-4 rounded font-semibold border transition-all ${
                theme === 'dark'
                  ? 'bg-white text-blue-600 border-blue-600 hover:bg-blue-100'
                  : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-400'
              }`}
              style={{ display: 'inline-block', marginRight: '0.5rem' }}
            >
              Calibrate
            </button>

            {/* Restart Button */}
            <button
              onClick={onRestart}
              className={`py-2 px-4 rounded font-semibold border transition-all ${
                theme === 'dark'
                  ? 'bg-white text-red-700 border-red-700 hover:bg-red-100'
                  : 'bg-red-700 text-white border-red-700 hover:bg-red-400'
              }`}
              style={{ display: 'inline-block' }}
            >
              Restart
            </button>
          </div>

          {/* WiFi Settings */}
          <div className="space-y-2">
            <button
              onClick={() => setWifiOpen((v) => !v)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                theme === 'dark'
                  ? 'border-gray-700 hover:bg-gray-800'
                  : 'border-gray-300 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <Wifi size={18} />
                <span className="font-semibold">Wi-Fi Settings</span>
              </div>
              <ChevronDown
                size={18}
                className={`transition-transform ${
                  wifiOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {wifiOpen && (
              <div
                className={`p-4 rounded-xl border shadow-inner space-y-4 ${
                  theme === 'dark'
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
                    onChange={(e) => setWifiSSID(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${
                      theme === 'dark'
                        ? 'bg-gray-900 border-gray-600 text-white placeholder-gray-500'
                        : 'bg-white border-gray-300 text-black placeholder-gray-400'
                    }`}
                  />
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Password</Label>
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${
                      theme === 'dark'
                        ? 'bg-gray-900 border-gray-600 text-white placeholder-gray-500'
                        : 'bg-white border-gray-300 text-black placeholder-gray-400'
                    }`}
                  />
                </div>

                {/* Apply */}
                <button
                  onClick={() => {
                    setWifiOpen(false);
                    onWifiChange && onWifiChange(wifiSSID, wifiPassword);
                  }}
                  className={`w-full py-2 rounded-lg font-semibold transition-all ${
                    theme === 'dark'
                      ? 'bg-white text-black hover:bg-gray-200'
                      : 'bg-black text-white hover:bg-gray-800'
                  }`}
                >
                  Apply Wi-Fi Settings
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className={`p-6 border-t ${
            theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
          }`}
        >
          <button
            onClick={onClose}
            className={`w-full py-3 px-6 rounded-xl font-semibold transition-all ${
              theme === 'dark'
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
