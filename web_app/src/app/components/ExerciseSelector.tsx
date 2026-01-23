import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { useStore } from '../store';
import { Exercise } from '../models';
import { useShallow } from 'zustand/react/shallow';
import { Switch } from './ui/switch';

interface ExerciseSelectorProps {
  onAddExercise: (ex: Exercise) => void;
  onDeleteExercise: (name: string) => void;
}

export default function ExerciseSelector({
  onAddExercise,
  onDeleteExercise,
}: ExerciseSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newThreshold, setNewThreshold] = useState(70);
  const [type, setType] = useState<'singular' | 'alternating'>('singular');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { exercises, selectedExercise, isDarkMode, setSelectedExercise } =
    useStore(
      useShallow((s) => ({
        exercises: s.exercises,
        selectedExercise: s.selectedExercise,
        isDarkMode: s.config.theme === 'dark',
        setSelectedExercise: s.setSelectedExercise,
      }))
    );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setShowAddDialog(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddExercise = () => {
    if (newExerciseName.trim()) {
      onAddExercise({
        name: newExerciseName,
        thresholdPercentage: newThreshold,
        type: type,
      });
      setNewExerciseName('');
      setNewThreshold(70);
      setType('singular');
      setShowAddDialog(false);
      setIsOpen(false);
    }
  };

  return (
    <div ref={dropdownRef} className="flex flex-col items-end sm:items-center">
      {/* Trigger Button */}
      <button
        onClick={(e) => {
          e.stopPropagation(); // Prevent event bubbling
          setIsOpen(!isOpen);
        }}
        className={`flex items-center gap-2 px-4 py-3 rounded-lg transition-all duration-200 bg-opacity-90 ${
          isDarkMode
            ? 'hover:bg-gray-900 bg-gray-900'
            : 'hover:bg-gray-100 bg-white'
        }`}
      >
        <span className="text-lg sm:text-xl font-semibold truncate">
          {selectedExercise?.name || 'Select Exercise'}
        </span>
        <ChevronDown
          size={20}
          className={`flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute left-0 right-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-2 w-full sm:w-64 max-h-[80vh] rounded-xl shadow-2xl overflow-hidden z-50 backdrop-blur-md ${
            isDarkMode
              ? 'bg-gray-900 bg-opacity-95 border border-gray-700'
              : 'bg-white bg-opacity-95 border border-gray-300'
          }`}
        >
          {/* Rest of your existing dropdown content stays exactly the same */}
          <div className="max-h-[calc(100vh-120px)] sm:max-h-80 overflow-y-auto">
            {exercises.map((exercise) => (
              <div
                key={exercise.name}
                className={`group relative w-full transition-colors ${
                  selectedExercise?.name === exercise.name
                    ? isDarkMode
                      ? 'bg-gray-800'
                      : 'bg-gray-200'
                    : isDarkMode
                      ? 'hover:bg-gray-800'
                      : 'hover:bg-gray-100'
                }`}
              >
                <button
                  onClick={() => {
                    setSelectedExercise(exercise);
                    setIsOpen(false);
                  }}
                  className="w-full px-4 py-3 text-left"
                >
                  <div className="flex justify-between items-center pr-8">
                    <span className="font-medium">{exercise.name}</span>
                    <span
                      className={`text-sm transition-opacity ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      } ${exercises.length > 1 ? 'opacity-0 group-hover:opacity-100' : ''}`}
                    >
                      {exercise.thresholdPercentage.toFixed(0)}%
                    </span>
                  </div>
                </button>

                {/* Delete Button - Keep existing hover behavior */}
                {exercises.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteExercise(exercise.name);
                    }}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ${
                      isDarkMode
                        ? 'hover:bg-red-900 hover:text-red-300'
                        : 'hover:bg-red-100 hover:text-red-600'
                    }`}
                    aria-label="Delete exercise"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}

            {/* Add Exercise Button */}
            <button
              onClick={() => setShowAddDialog(true)}
              className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-2 border-t ${
                isDarkMode
                  ? 'hover:bg-gray-800 border-gray-800'
                  : 'hover:bg-gray-100 border-gray-200'
              }`}
            >
              <Plus size={18} />
              <span className="font-medium">Add Exercise</span>
            </button>
          </div>

          {/* Add Exercise Dialog - Make it full-screen on mobile */}
          {showAddDialog && (
            <div
              className={`border-t p-4 ${
                isDarkMode
                  ? 'border-gray-800 bg-gray-850'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              {/* Close button for mobile add dialog - hidden on desktop */}
              <div className="sm:hidden flex items-center justify-between mb-4">
                <h4 className="font-semibold text-lg">New Exercise</h4>
                <button
                  onClick={() => setShowAddDialog(false)}
                  className={`p-2 rounded-lg ${
                    isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
                  }`}
                >
                  <X size={20} />
                </button>
              </div>
              <h4 className="font-semibold mb-3 hidden sm:block">
                New Exercise
              </h4>

              {/* Rest of your existing add dialog content stays exactly the same */}
              <input
                type="text"
                placeholder="Exercise name"
                value={newExerciseName}
                onChange={(e) => setNewExerciseName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddExercise()}
                className={`w-full px-3 py-2 rounded-lg mb-3 border ${
                  isDarkMode
                    ? 'bg-gray-900 border-gray-700 text-white placeholder-gray-500'
                    : 'bg-white border-gray-300 text-black placeholder-gray-400'
                }`}
                autoFocus
              />

              <div className="mb-3">
                <label className="text-sm font-medium mb-1 block">
                  Threshold: {newThreshold}%
                </label>
                <input
                  type="range"
                  min="10"
                  max="90"
                  step="5"
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(Number(e.target.value))}
                  className={`w-full h-2 rounded-lg appearance-none ${
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
              </div>

              <div className="mb-3">
                <label className="text-sm font-medium mb-2 block">
                  Exercise Type
                </label>
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`text-sm ${
                      type === 'singular'
                        ? 'font-semibold'
                        : isDarkMode
                          ? 'text-gray-500'
                          : 'text-gray-400'
                    }`}
                  >
                    Singular
                  </span>
                  <Switch
                    id="auto-set"
                    checked={type === 'alternating'}
                    onCheckedChange={(checked) =>
                      setType(checked ? 'alternating' : 'singular')
                    }
                    className="ml-4"
                  />
                  <span
                    className={`text-sm ${
                      type === 'alternating'
                        ? 'font-semibold'
                        : isDarkMode
                          ? 'text-gray-500'
                          : 'text-gray-400'
                    }`}
                  >
                    Alternating
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleAddExercise}
                  className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
                    isDarkMode
                      ? 'bg-white text-black hover:bg-gray-200'
                      : 'bg-black text-white hover:bg-gray-800'
                  }`}
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowAddDialog(false);
                    setNewExerciseName('');
                  }}
                  className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
                    isDarkMode
                      ? 'bg-gray-800 text-white hover:bg-gray-700'
                      : 'bg-gray-200 text-black hover:bg-gray-300'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
