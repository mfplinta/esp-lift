import { X } from 'lucide-react';
import { Switch } from '@/app/components/ui/switch';
import { Label } from '@/app/components/ui/label';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  strictMode: boolean;
  onStrictModeChange: (value: boolean) => void;
  autoSetCompletion: boolean;
  onAutoSetCompletionChange: (value: boolean) => void;
  autoSetTimeout: number;
  onAutoSetTimeoutChange: (value: number) => void;
  onCalibrate?: () => void;
  onRestart?: () => void;
}

export default function ConfigModal({
  isOpen,
  onClose,
  theme,
  strictMode,
  onStrictModeChange,
  autoSetCompletion,
  onAutoSetCompletionChange,
  autoSetTimeout,
  onAutoSetTimeoutChange,
  onCalibrate,
  onRestart,
}: ConfigModalProps) {
  if (!isOpen) return null;

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
                  checked={strictMode}
                  onCheckedChange={onStrictModeChange}
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
                  checked={autoSetCompletion}
                  onCheckedChange={onAutoSetCompletionChange}
                  className="ml-4"
                />
              </div>

              {/* Timeout Setting */}
              {autoSetCompletion && (
                <div className="pt-2">
                  <Label htmlFor="timeout" className="text-sm font-medium">
                    Inactivity Timeout: {autoSetTimeout}s
                  </Label>
                  <input
                    id="timeout"
                    type="range"
                    min="5"
                    max="60"
                    step="5"
                    value={autoSetTimeout}
                    onChange={(e) =>
                      onAutoSetTimeoutChange(Number(e.target.value))
                    }
                    className={`w-full mt-2 h-2 rounded-lg appearance-none cursor-pointer ${
                      theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'
                    }`}
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

          {/* Advanced Section */}
          <div className="space-y-4">
            <h3
              className={`text-lg font-bold ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
              }`}
            >
              Advanced
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
