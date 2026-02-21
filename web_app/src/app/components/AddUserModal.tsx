import { useState } from 'react';
import { X, User } from 'lucide-react';
import { useAppSelector } from '../store';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddUser: (name: string, color: string) => void;
}

const COLOR_OPTIONS = [
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
];

export default function AddUserModal({
  isOpen,
  onClose,
  onAddUser,
}: AddUserModalProps) {
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);

  const isDarkMode = useAppSelector((s) => s.machine.config.theme === 'dark');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onAddUser(name.trim(), selectedColor);
      setName('');
      setSelectedColor(COLOR_OPTIONS[0]);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
        onClick={onClose}
      />
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
          <h2 className="text-2xl font-bold">Add New User</h2>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Name Input */}
          <div>
            <label
              htmlFor="userName"
              className={`block text-sm font-medium mb-2 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}
            >
              Name
            </label>
            <input
              id="userName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter user name"
              className={`w-full px-4 py-3 rounded-lg border text-sm ${
                isDarkMode
                  ? 'bg-gray-900 border-gray-600 text-white placeholder-gray-500'
                  : 'bg-white border-gray-300 text-black placeholder-gray-400'
              } focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
              autoFocus
            />
          </div>

          {/* Color Selection */}
          <div>
            <label
              className={`block text-sm font-medium mb-3 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}
            >
              Avatar Color
            </label>

            {/* Color Options */}
            <div className="grid grid-cols-4 gap-3">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`w-full aspect-square rounded-lg transition-all duration-300 border-4 ${
                    selectedColor === color
                      ? 'border-white scale-110 shadow-lg'
                      : isDarkMode
                        ? 'border-gray-700 hover:scale-105 hover:border-gray-500'
                        : 'border-gray-300 hover:scale-105 hover:border-gray-400'
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`Select color ${color}`}
                />
              ))}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all ${
                isDarkMode
                  ? 'bg-white text-black hover:bg-gray-200'
                  : 'bg-black text-white hover:bg-gray-800'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all ${
                !name.trim()
                  ? isDarkMode
                    ? 'bg-white/60 text-black cursor-not-allowed'
                    : 'bg-black/60 text-white cursor-not-allowed'
                  : isDarkMode
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              Add User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
