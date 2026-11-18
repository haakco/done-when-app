// Loaded only on share pages that use it, so the main bundle does not carry it.

import { useState } from "react";
import { saveGuessBook } from "../lib/device";
import { formatDate } from "../lib/dates";
import { addGuess, closestText, daysOffText, FORECAST_NAME, guessLabel, rankGuesses, reveal, type GuessBook } from "../lib/guesses";
import { Field } from "./Field";
import "../styles/guess.css";

type GuessFirstProps = { itemUuid: string; book: GuessBook; forecastMedian: string | null };

/** Before the forecast shows: lock in one or more guesses on this device, or skip straight to it. */
export function GuessFirst({ itemUuid, book, forecastMedian }: GuessFirstProps) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const count = book.guesses.length;
  return (
    <div className="guess">
      <h2 className="guess__title">When do you think it will be done?</h2>
      <p className="small">Guess before you see the forecast. When it is done, this page shows whose guess was closest. Guesses stay on this device.</p>
      <form
        className="guess__form"
        onSubmit={(event) => {
          event.preventDefault();
          saveGuessBook(itemUuid, addGuess(book, { name, date }));
          setName("");
          setDate("");
        }}
      >
        <Field label="Your guess">
          {(control) => <input {...control} type="date" required value={date} onChange={(event) => { setDate(event.target.value); }} />}
        </Field>
        <Field label="Your name (optional)">
          {(control) => <input {...control} autoComplete="given-name" value={name} onChange={(event) => { setName(event.target.value); }} />}
        </Field>
        <button type="submit" className="button button--primary">
          Lock in guess
        </button>
      </form>
      <p className="small" role="status">
        {count > 0 ? `Locked in: ${book.guesses.map((guess, index) => `${guessLabel(guess, index)}, ${formatDate(guess.date)}`).join("; ")}. Someone else here can add theirs too.` : ""}
      </p>
      <div className="button-row">
        <button type="button" className="button" onClick={() => { saveGuessBook(itemUuid, reveal(book, forecastMedian)); }}>
          {count > 0 ? "Show the forecast" : "Skip, show the forecast"}
        </button>
      </div>
    </div>
  );
}

/** After the reveal: the guesses waiting for the finish, or, once done, who was closest. */
export function GuessResults({ book, completedAt }: { book: GuessBook; completedAt: string | null }) {
  if (book.guesses.length === 0) return null;
  if (completedAt === null) {
    const forecast = book.forecastAtReveal ? ` The forecast said ${formatDate(book.forecastAtReveal)} when you looked.` : "";
    return (
      <p className="small guess-waiting">
        Guesses on this device: {book.guesses.map((guess, index) => `${guessLabel(guess, index)}, ${formatDate(guess.date)}`).join("; ")}.{forecast} Whoever is closest shows here when it is done.
      </p>
    );
  }
  const results = rankGuesses(book, completedAt);
  return (
    <section className="card section guess-results" aria-labelledby="guess-results-heading">
      <h2 id="guess-results-heading">Who guessed closest?</h2>
      <p className="guess-results__winner">{closestText(results)}</p>
      <ol className="guess-results__list">
        {results.map((result) => (
          <li key={`${result.label}-${result.date}`}>
            <strong>{result.label === FORECAST_NAME ? `${FORECAST_NAME} (when you looked)` : result.label}</strong>{" "}
            <span className="numeric">
              {formatDate(result.date)} · {daysOffText(result.daysOff)}
            </span>
          </li>
        ))}
      </ol>
      <p className="small muted">Done {formatDate(completedAt)}. Only guesses made on this device before the forecast was shown are counted.</p>
    </section>
  );
}
