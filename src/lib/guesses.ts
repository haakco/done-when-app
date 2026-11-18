// "Guess first": viewers on one device lock in completion guesses before seeing the forecast, and
// once the item is done the closest guess is named. Only guesses made before the reveal count,
// and the forecast competes with the date it showed at the reveal, not a later, better one.

const DAY_MS = 86_400_000;

/** A guess is a calendar date, `YYYY-MM-DD`. */
export type Guess = { name: string; date: string };

/** What one device remembers for one item. */
export type GuessBook = { revealed: boolean; guesses: Guess[]; forecastAtReveal: string | null };

export const EMPTY_GUESS_BOOK: GuessBook = { revealed: false, guesses: [], forecastAtReveal: null };

export const FORECAST_NAME = "The forecast";

export function parseGuessBook(raw: string | null): GuessBook {
  if (raw === null) return EMPTY_GUESS_BOOK;
  try {
    const value = JSON.parse(raw) as Partial<GuessBook>;
    const guesses = Array.isArray(value.guesses) ? value.guesses.filter((guess) => typeof guess.name === "string" && isDay(guess.date)) : [];
    return { revealed: value.revealed === true, guesses, forecastAtReveal: typeof value.forecastAtReveal === "string" ? value.forecastAtReveal : null };
  } catch {
    return EMPTY_GUESS_BOOK;
  }
}

function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function addGuess(book: GuessBook, guess: Guess): GuessBook {
  if (book.revealed) return book;
  return { ...book, guesses: [...book.guesses, { name: guess.name.trim(), date: guess.date }] };
}

export function reveal(book: GuessBook, forecastMedian: string | null): GuessBook {
  return { ...book, revealed: true, forecastAtReveal: forecastMedian };
}

/** A guess without a name is "Guess 2" by its place, so every row can be told apart. */
export function guessLabel(guess: Guess, index: number): string {
  return guess.name || `Guess ${index + 1}`;
}

export type GuessResult = { label: string; date: string; daysOff: number };

/** Every guess and the forecast, closest first; ties keep the order they were made in. */
export function rankGuesses(book: GuessBook, completedAt: string): GuessResult[] {
  const actual = dayOf(completedAt);
  const entries = book.guesses.map((guess, index) => ({ label: guessLabel(guess, index), date: guess.date }));
  if (book.forecastAtReveal) entries.push({ label: FORECAST_NAME, date: dayOf(book.forecastAtReveal) });
  return entries
    .map((entry) => ({ ...entry, daysOff: Math.abs(Date.parse(entry.date) - Date.parse(actual)) / DAY_MS }))
    .sort((a, b) => a.daysOff - b.daysOff);
}

/** "Sam was closest, 1 day off." or "Sam and The forecast tied, 2 days off." */
export function closestText(results: GuessResult[]): string | null {
  const best = results[0];
  if (!best) return null;
  const tied = results.filter((result) => result.daysOff === best.daysOff).map((result) => result.label);
  const off = daysOffText(best.daysOff);
  if (tied.length > 1) return `${tied.slice(0, -1).join(", ")} and ${tied.at(-1) ?? ""} tied, ${off}.`;
  return `${best.label} was closest, ${off}.`;
}

export function daysOffText(days: number): string {
  if (days === 0) return "spot on";
  return `${days} day${days === 1 ? "" : "s"} off`;
}

function dayOf(iso: string): string {
  return new Date(Date.parse(iso)).toISOString().slice(0, 10);
}
