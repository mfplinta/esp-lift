import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';

export interface Exercise {
  name: string;
  thresholdPercentage: number;
  type: 'singular' | 'alternating';
}

interface ExerciseSelectorProps {
  exercises: Exercise[];
  selectedExercise: Exercise | null;
  onSelectExercise: (exercise: Exercise) => void;
  onAddExercise: (
    name: string,
    threshold: number,
    type: 'singular' | 'alternating'
  ) => void;
  onDeleteExercise?: (name: string) => void;
  theme: 'light' | 'dark';
}

export default function ExerciseSelector({
  exercises,
  selectedExercise,
  onSelectExercise,
  onAddExercise,
  onDeleteExercise,
  theme,
}: ExerciseSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newThreshold, setNewThreshold] = useState(70);
  const [type, setType] = useState<'singular' | 'alternating'>('singular');
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      onAddExercise(newExerciseName.trim(), newThreshold, type);
      setNewExerciseName('');
      setNewThreshold(70);
      setType('singular');
      setShowAddDialog(false);
      setIsOpen(false);
    }
  };

  return (
    <div ref={dropdownRef} className="flex flex-col sm:items-center items-end">
      {/* Trigger Button */}
      <button
        onClick={(e) => {
          e.stopPropagation(); // Prevent event bubbling
          setIsOpen(!isOpen);
        }}
        className={`flex items-center gap-2 px-4 py-3 rounded-lg transition-all duration-200 bg-opacity-90 ${
          theme === 'dark'
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
          className={`left-1/2 sm:-translate-x-1/2 sm:absolute top-0 left-0 sm:top-full mt-0 sm:mt-2 w-screen sm:w-64 max-h-screen sm:max-h-[80vh] rounded-none sm:rounded-xl shadow-2xl overflow-hidden z-50 ${
            theme === 'dark'
              ? 'bg-gray-900 bg-opacity-95 backdrop-blur-md border-0 sm:border border-gray-700'
              : 'bg-white bg-opacity-95 backdrop-blur-md border-0 sm:border border-gray-300'
          }`}
        >
          {/* Close button for mobile - hidden on desktop */}
          <div className="sm:hidden flex items-center justify-between p-4 border-b border-gray-700">
            <span className="font-semibold text-lg">Select Exercise</span>
            <button
              onClick={() => setIsOpen(false)}
              className={`p-2 rounded-lg ${
                theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
              }`}
            >
              <X size={20} />
            </button>
          </div>

          {/* Rest of your existing dropdown content stays exactly the same */}
          <div className="max-h-[calc(100vh-120px)] sm:max-h-80 overflow-y-auto">
            {exercises.map((exercise) => (
              <div
                key={exercise.name}
                className={`group relative w-full transition-colors ${
                  selectedExercise?.name === exercise.name
                    ? theme === 'dark'
                      ? 'bg-gray-800'
                      : 'bg-gray-200'
                    : theme === 'dark'
                      ? 'hover:bg-gray-800'
                      : 'hover:bg-gray-100'
                }`}
              >
                <button
                  onClick={() => {
                    onSelectExercise(exercise);
                    setIsOpen(false);
                  }}
                  className="w-full px-4 py-3 text-left"
                >
                  <div className="flex justify-between items-center pr-8">
                    <span className="font-medium">{exercise.name}</span>
                    <span
                      className={`text-sm transition-opacity ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                      } ${onDeleteExercise && exercises.length > 1 ? 'opacity-0 group-hover:opacity-100' : ''}`}
                    >
                      {exercise.thresholdPercentage.toFixed(0)}%
                    </span>
                  </div>
                </button>

                {/* Delete Button - Keep existing hover behavior */}
                {onDeleteExercise && exercises.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteExercise(exercise.name);
                      if (selectedExercise?.name === exercise.name) {
                        const remainingExercises = exercises.filter(
                          (ex) => ex.name !== exercise.name
                        );
                        if (remainingExercises.length > 0) {
                          onSelectExercise(remainingExercises[0]);
                        }
                      }
                    }}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ${
                      theme === 'dark'
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
                theme === 'dark'
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
                theme === 'dark'
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
                    theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
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
                  theme === 'dark'
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
                    theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'
                  }`}
                  style={{
                    accentColor: theme === 'dark' ? '#10b981' : '#059669',
                  }}
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
                        : theme === 'dark'
                          ? 'text-gray-500'
                          : 'text-gray-400'
                    }`}
                  >
                    Singular
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setType(type === 'singular' ? 'alternating' : 'singular')
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      type === 'alternating'
                        ? theme === 'dark'
                          ? 'bg-green-600'
                          : 'bg-green-500'
                        : theme === 'dark'
                          ? 'bg-gray-700'
                          : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        type === 'alternating'
                          ? 'translate-x-6'
                          : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span
                    className={`text-sm ${
                      type === 'alternating'
                        ? 'font-semibold'
                        : theme === 'dark'
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
                    theme === 'dark'
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
                    theme === 'dark'
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
