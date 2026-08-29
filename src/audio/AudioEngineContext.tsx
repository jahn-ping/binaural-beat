import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AudioEngine, getAudioEngine } from './engine';

interface AudioEngineCtx {
  engine: AudioEngine;
  isPlaying: boolean;
  isPaused: boolean;
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

const Ctx = createContext<AudioEngineCtx | null>(null);

/** Owns the singleton engine; StrictMode-safe (module-level singleton, lazy graph). */
export function AudioEngineProvider({ children }: { children: ReactNode }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const engineRef = useRef<AudioEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = getAudioEngine();
  }
  const engine = engineRef.current;

  // Re-bind the state callback on every mount (module-level singleton survives
  // StrictMode remounts and HMR, so the engine must never hold a stale setter).
  useEffect(() => {
    engine.setOnStateChange((playing, paused) => {
      setIsPlaying(playing);
      setIsPaused(paused);
    });
  }, [engine, setIsPlaying, setIsPaused]);

  const play = useCallback(() => {
    void engine.play().catch((err: unknown) => {
      console.error('Audio start failed', err);
      setIsPlaying(false);
    });
  }, [engine]);

  const pause = useCallback(() => {
    void engine.pause().catch((err: unknown) => {
      console.error('Audio pause failed', err);
    });
  }, [engine]);

  const resume = useCallback(() => {
    void engine.resume().catch((err: unknown) => {
      console.error('Audio resume failed', err);
    });
  }, [engine]);

  const stop = useCallback(() => {
    engine.stop();
  }, [engine]);

  const value = useMemo<AudioEngineCtx>(
    () => ({ engine, isPlaying, isPaused, play, pause, resume, stop }),
    [engine, isPlaying, isPaused, play, pause, resume, stop],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAudioEngine(): AudioEngineCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAudioEngine must be used within AudioEngineProvider');
  return ctx;
}