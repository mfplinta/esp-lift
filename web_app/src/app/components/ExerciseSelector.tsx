import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { Exercise } from '../models';
import { Switch } from './ui/switch';
import { shallowEqual } from 'react-redux';
import { setSelectedExercise, useAppDispatch, useAppSelector } from '../store';

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
  const [categoryInput, setCategoryInput] = useState('');
  const [categoryIsNew, setCategoryIsNew] = useState(false);
  const [showCategoryOptions, setShowCategoryOptions] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const suppressCategoryBlurRef = useRef(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const normalizeCategoryKey = (value: string) =>
    value.trim().toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-');

  const formatCategoryLabel = (value: string) =>
    value.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

  const dispatch = useAppDispatch();
  const { exercises, categories, selectedExercise, isDarkMode } =
    useAppSelector(
      (s) => ({
        exercises: s.machine.exercises,
        categories: s.machine.categories,
        selectedExercise: s.machine.selectedExercise,
        isDarkMode: s.machine.config.theme === 'dark',
      }),
      shallowEqual
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

  const resetAddExerciseForm = () => {
    suppressCategoryBlurRef.current = true;
    setNewExerciseName('');
    setNewThreshold(70);
    setType('singular');
    setCategoryInput('');
    setCategoryIsNew(false);
    setSelectedCategoryId(null);
    setShowCategoryOptions(false);
    setShowAddDialog(false);
    setIsOpen(false);
    window.setTimeout(() => {
      suppressCategoryBlurRef.current = false;
    }, 200);
  };

  const handleAddExercise = () => {
    if (newExerciseName.trim()) {
      const trimmedCategory = categoryInput.trim();
      const normalizedCategory = normalizeCategoryKey(trimmedCategory);
      // Find exact match by name (case-insensitive, normalized)
      const matchingCategory = categories.find(
        (category) => normalizeCategoryKey(category.name) === normalizedCategory
      );
      const isNewCategory =
        !!normalizedCategory && !matchingCategory && categoryIsNew;
      const categoryName = trimmedCategory || 'General';

      onAddExercise({
        name: newExerciseName,
        thresholdPercentage: newThreshold,
        type: type,
        // If new, send only categoryName; if existing, send only categoryId
        ...(isNewCategory
          ? { categoryName }
          : { categoryId: selectedCategoryId ?? matchingCategory?.id }),
      });
      resetAddExerciseForm();
    }
  };

  const groupedExercises = categories.reduce(
    (
      acc: Record<string, { id: string; name: string; items: Exercise[] }>,
      category
    ) => {
      acc[category.id] = {
        id: category.id,
        name: formatCategoryLabel(category.name),
        items: exercises.filter(
          (exercise) => exercise.categoryId === category.id
        ),
      };
      return acc;
    },
    {}
  );

  const uncategorizedExercises = exercises.filter(
    (exercise) => !exercise.categoryId
  );

  const categoryGroups = [
    ...Object.values(groupedExercises),
    ...(uncategorizedExercises.length
      ? [{ id: 'uncategorized', name: 'Other', items: uncategorizedExercises }]
      : []),
  ].filter((group) => group.items.length > 0);

  const normalizedCategoryInput = normalizeCategoryKey(categoryInput);
  const filteredCategories = categories.filter((category) =>
    normalizeCategoryKey(category.name).includes(normalizedCategoryInput)
  );
  const categoryExactMatch = categories.some(
    (category) =>
      normalizeCategoryKey(category.name) === normalizedCategoryInput
  );

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
            {categoryGroups.map((group) => (
              <div key={group.id}>
                <div
                  className={`px-4 py-2 text-xs font-bold uppercase tracking-widest ${
                    isDarkMode
                      ? 'text-gray-300 bg-gray-900/80'
                      : 'text-gray-600 bg-white/80'
                  }`}
                >
                  {group.name}
                </div>
                {group.items.map((exercise) => (
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
                        dispatch(setSelectedExercise(exercise));
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
                  Category
                </label>
                <div className="relative">
                  {categoryIsNew && categoryInput.trim() && (
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 rounded-md bg-green-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-800">
                      new:
                    </span>
                  )}
                  <input
                    type="text"
                    placeholder="Select or type a category"
                    value={categoryInput}
                    onChange={(e) => {
                      setCategoryInput(e.target.value);
                      setCategoryIsNew(false);
                      setSelectedCategoryId(null);
                      setShowCategoryOptions(true);
                    }}
                    onFocus={() => setShowCategoryOptions(true)}
                    onBlur={(event) => {
                      const nextValue = event.currentTarget.value;
                      window.setTimeout(() => {
                        if (suppressCategoryBlurRef.current) return;
                        setShowCategoryOptions(false);
                        if (nextValue.trim() && !categoryExactMatch) {
                          setCategoryIsNew(true);
                          setCategoryInput(formatCategoryLabel(nextValue));
                        }
                      }, 150);
                    }}
                    className={`w-full rounded-lg border py-2 ${
                      categoryIsNew ? 'pl-20 pr-3' : 'px-3'
                    } ${
                      isDarkMode
                        ? 'bg-gray-900 border-gray-700 text-white placeholder-gray-500'
                        : 'bg-white border-gray-300 text-black placeholder-gray-400'
                    }`}
                  />

                  {showCategoryOptions && (
                    <div
                      className={`absolute z-20 mt-2 w-full rounded-lg border shadow-lg ${
                        isDarkMode
                          ? 'bg-gray-900 border-gray-700'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="max-h-40 overflow-y-auto">
                        {filteredCategories.map((category) => (
                          <button
                            key={category.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setCategoryInput(
                                formatCategoryLabel(category.name)
                              );
                              setCategoryIsNew(false);
                              setSelectedCategoryId(category.id);
                              setShowCategoryOptions(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                              isDarkMode
                                ? 'hover:bg-gray-800 text-gray-100'
                                : 'hover:bg-gray-100 text-gray-700'
                            }`}
                          >
                            {formatCategoryLabel(category.name)}
                          </button>
                        ))}
                        {categoryInput.trim() && !categoryExactMatch && (
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setCategoryIsNew(true);
                              setCategoryInput(
                                formatCategoryLabel(categoryInput)
                              );
                              setSelectedCategoryId(null);
                              setShowCategoryOptions(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                              isDarkMode
                                ? 'text-green-300 hover:bg-gray-800'
                                : 'text-green-700 hover:bg-gray-100'
                            }`}
                          >
                            <Plus size={14} />
                            Create: {categoryInput.trim()}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
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
                    resetAddExerciseForm();
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
