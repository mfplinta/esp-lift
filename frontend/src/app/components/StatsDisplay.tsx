import { shallowEqual } from 'react-redux';
import { useAppSelector } from '../store';
import { useCallback, useEffect, useRef } from 'react';

interface StatsDisplayProps {
  size?: 'normal' | 'large';
  highlight?: boolean;
}

const WORKOUT_BELL_URL = '/workout_bell.mp3';
const SET_REST_BELL_URL = '/set_rest_bell.mp3';

export default function StatsDisplay({
  size = 'normal',
  highlight = false,
}: StatsDisplayProps) {
  const { isResting, activeTime, isDarkMode, reps, sets, repTarget } =
    useAppSelector(
      (s) => ({
        isResting: s.machine.isResting,
        activeTime: s.machine.activeTime,
        isDarkMode: s.machine.config.theme === 'dark',
        reps: s.machine.reps,
        sets: s.machine.sets,
        repTarget: s.machine.repTarget,
      }),
      shallowEqual
    );

  const isFinalTargetSet = repTarget.enabled
    ? sets === Math.max(0, repTarget.sets - 1)
    : false;
  const isNearTarget =
    repTarget.enabled && reps >= Math.max(0, repTarget.reps - 2) && !isResting;

  const playBell = useCallback((bellUrl: string) => {
    const pool = bellPoolsRef.current[bellUrl] ?? [];
    let audio = pool.find((item) => item.paused || item.ended);
    if (!audio) {
      audio = new Audio(bellUrl);
      audio.preload = 'auto';
      audio.volume = 0.8;
      pool.push(audio);
      bellPoolsRef.current[bellUrl] = pool;
    }

    audio.currentTime = 0;
    audio.play();
  }, []);

  const lastBellSetRef = useRef<number | null>(null);
  const lastFinalBellSetRef = useRef<number | null>(null);
  const restTimerRef = useRef<number | null>(null);
  const audioUnlockedRef = useRef(false);
  const bellPoolsRef = useRef<Record<string, HTMLAudioElement[]>>({
    [SET_REST_BELL_URL]: [],
    [WORKOUT_BELL_URL]: [],
  });
  const restStartRef = useRef<number | null>(null);
  const restBellRungRef = useRef<boolean>(false);

  useEffect(() => {
    if (isResting) {
      restBellRungRef.current = false;
    }
  }, [isResting]);

  useEffect(() => {
    const preload = (bellUrl: string) => {
      const pool = bellPoolsRef.current[bellUrl] ?? [];
      if (pool.length === 0) {
        const audio = new Audio(bellUrl);
        audio.preload = 'auto';
        audio.volume = 0.8;
        pool.push(audio);
        bellPoolsRef.current[bellUrl] = pool;
      }
    };

    preload(SET_REST_BELL_URL);
    preload(WORKOUT_BELL_URL);
  }, []);

  /* Workaround to play audio */
  useEffect(() => {
    if (audioUnlockedRef.current) return;

    const unlock = () => {
      if (audioUnlockedRef.current) return;
      audioUnlockedRef.current = true;

      Object.values(bellPoolsRef.current).forEach((pool) => {
        pool.forEach((audio) => {
          audio.muted = true;
          audio
            .play()
            .then(() => {
              audio.pause();
              audio.currentTime = 0;
              audio.muted = false;
            })
            .catch(() => {
              audio.muted = false;
            });
        });
      });
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!repTarget.enabled || isResting) return;

    if (reps >= repTarget.reps) {
      if (isFinalTargetSet) {
        if (lastFinalBellSetRef.current !== sets) {
          lastFinalBellSetRef.current = sets;
          lastBellSetRef.current = sets;
          playBell(WORKOUT_BELL_URL);
        }
      } else {
        if (lastBellSetRef.current !== sets) {
          lastBellSetRef.current = sets;
          playBell(SET_REST_BELL_URL);
        }
      }
    } else {
      lastBellSetRef.current = null;
      lastFinalBellSetRef.current = null;
    }
  }, [isFinalTargetSet, isResting, playBell, repTarget, reps, sets]);

  useEffect(() => {
    // clear any previous timer
    if (restTimerRef.current) {
      window.clearTimeout(restTimerRef.current);
      restTimerRef.current = null;
    }

    if (!repTarget.restEnabled || !isResting) {
      restStartRef.current = null;
      return;
    }

    const totalConfigured = repTarget.restMinutes * 60 + repTarget.restSeconds;
    if (totalConfigured <= 0) return;

    // mark rest start
    restStartRef.current = Date.now();

    const delaySeconds = Math.max(0, totalConfigured - (activeTime || 0));

    if (delaySeconds <= 0) {
      if (!restBellRungRef.current) {
        playBell(SET_REST_BELL_URL);
        restBellRungRef.current = true;
      }
      return;
    }

    restTimerRef.current = window.setTimeout(
      () => {
        if (!restBellRungRef.current) {
          playBell(SET_REST_BELL_URL);
          restBellRungRef.current = true;
        }
        restTimerRef.current = null;
      },
      Math.ceil(delaySeconds * 1000)
    );

    return () => {
      if (restTimerRef.current) {
        window.clearTimeout(restTimerRef.current);
        restTimerRef.current = null;
      }
    };
  }, [isResting, playBell, repTarget, activeTime]);

  const repsTone =
    isFinalTargetSet && reps >= repTarget.reps
      ? 'reached'
      : isNearTarget
        ? 'near'
        : 'normal';

  const repsSize =
    size === 'large'
      ? 'text-[clamp(2.5rem,6vw,4.75rem)]'
      : 'text-3xl sm:text-4xl lg:text-5xl';
  const setsSize =
    size === 'large'
      ? 'text-[clamp(2rem,5vw,3.75rem)]'
      : 'text-2xl sm:text-3xl lg:text-4xl';
  const labelColor = highlight
    ? isDarkMode
      ? 'text-red-300'
      : 'text-red-700'
    : isDarkMode
      ? 'text-white'
      : 'text-black';

  const subLabelColor = isDarkMode ? 'text-red-300/70' : 'text-red-700/70';

  const repsToneColor =
    repsTone === 'reached'
      ? 'text-green-400'
      : repsTone === 'near'
        ? 'text-yellow-300'
        : labelColor;

  return (
    <>
      <div
        className={`whitespace-nowrap border rounded-2xl px-[clamp(14px,2.6vw,24px)] py-[clamp(10px,2vw,18px)] ${
          isDarkMode ? 'border-white/15' : 'border-black/15'
        }`}
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[clamp(16px,3vw,28px)]">
          <div className="flex flex-col items-center">
            <div
              className={`text-xs sm:text-sm font-semibold tracking-widest uppercase ${subLabelColor}`}
            >
              Sets
            </div>
            <div
              className={`${setsSize} font-bold ${labelColor} tabular-nums text-center min-w-[3ch]`}
            >
              {sets}
            </div>
          </div>

          <div
            className={`h-[clamp(44px,9vw,64px)] w-px ${
              isDarkMode ? 'bg-white/20' : 'bg-black/20'
            }`}
          />

          <div className="flex flex-col items-center">
            <div
              className={`text-xs sm:text-sm font-semibold tracking-widest uppercase ${subLabelColor}`}
            >
              {isResting ? 'Rest' : 'Reps'}
            </div>
            {isResting ? (
              <span
                className={`${repsSize} font-bold transition-opacity duration-500 inline-block tabular-nums text-center min-w-[3ch] ${
                  isResting ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {activeTime.toFixed(1)}s
              </span>
            ) : (
              <span
                className={`${repsSize} font-bold transition-opacity duration-500 inline-block tabular-nums text-center min-w-[3ch] ${
                  !isResting ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <span className={highlight ? labelColor : repsToneColor}>
                  {reps}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
      {repTarget.enabled && (
        <div
          className={`text-xs tracking-wide uppercase text-center md:text-right ${
            isDarkMode ? 'text-white/50' : 'text-black/50'
          }`}
        >
          Target: {repTarget.sets} sets × {repTarget.reps} reps
        </div>
      )}
      {repTarget.restEnabled && (
        <div
          className={`text-xs tracking-wide uppercase text-center md:text-right ${
            isDarkMode ? 'text-white/50' : 'text-black/50'
          }`}
        >
          Rest: {repTarget.restMinutes != 0 && `${repTarget.restMinutes}M `}
          {repTarget.restSeconds}S
        </div>
      )}
    </>
  );
}
