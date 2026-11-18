import { useEffect, useState } from "react";

/** The time now, re-read every second while `ticking`; a countdown re-renders with it. */
export function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => { setNow(Date.now()); }, 1000);
    return () => { clearInterval(timer); };
  }, [ticking]);
  return now;
}
