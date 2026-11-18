import { useMemo, useSyncExternalStore } from "react";
import { guessBookText, subscribeDevice } from "./device";
import { parseGuessBook, type GuessBook } from "./guesses";

/** The guesses this device made for one item, kept in step with other tabs. */
export function useGuessBook(itemUuid: string): GuessBook {
  const text = useSyncExternalStore(subscribeDevice, () => guessBookText(itemUuid), () => null);
  return useMemo(() => parseGuessBook(text), [text]);
}
