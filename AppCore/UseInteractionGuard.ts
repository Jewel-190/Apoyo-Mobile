import { useCallback, useRef, useState } from "react";

/**
 * Prevents duplicate taps from starting the same async flow twice (e.g. slow network).
 */
export function useSingleFlight() {
  const inFlightRef = useRef(false);
  const [inFlight, setInFlight] = useState(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    if (inFlightRef.current) return null;
    inFlightRef.current = true;
    setInFlight(true);
    try {
      return await fn();
    } finally {
      inFlightRef.current = false;
      setInFlight(false);
    }
  }, []);

  return { inFlight, run };
}

/**
 * Drops stale async results when a newer load started (focus + pull-to-refresh overlap).
 */
export function useLatestAsyncSequence() {
  const seqRef = useRef(0);

  const begin = useCallback(() => {
    seqRef.current += 1;
    return seqRef.current;
  }, []);

  const isCurrent = useCallback((seq: number) => seqRef.current === seq, []);

  return { begin, isCurrent };
}
