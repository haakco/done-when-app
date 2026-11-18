import { describe, expect, it } from "vitest";
import { addGuess, closestText, EMPTY_GUESS_BOOK, parseGuessBook, rankGuesses, reveal } from "./guesses";

describe("guess first", () => {
  it("ranks this device's guesses and the forecast it showed against the finish date", () => {
    let book = addGuess(EMPTY_GUESS_BOOK, { name: " Sam ", date: "2026-12-03" });
    book = addGuess(book, { name: "", date: "2026-12-20" });
    book = reveal(book, "2026-12-08T12:00:00Z");
    // Guesses after the reveal do not count.
    book = addGuess(book, { name: "Late", date: "2026-12-05" });
    const results = rankGuesses(book, "2026-12-04T18:00:00Z");
    expect(results.map((result) => [result.label, result.daysOff])).toEqual([
      ["Sam", 1],
      ["The forecast", 4],
      ["Guess 2", 16],
    ]);
    expect(closestText(results)).toBe("Sam was closest, 1 day off.");
  });

  it("names a tie and a perfect guess", () => {
    const book = reveal(addGuess(EMPTY_GUESS_BOOK, { name: "Ana", date: "2026-12-04" }), "2026-12-04T00:00:00Z");
    expect(closestText(rankGuesses(book, "2026-12-04T09:00:00Z"))).toBe("Ana and The forecast tied, spot on.");
  });

  it("reads back what it stored and survives junk", () => {
    const book = reveal(addGuess(EMPTY_GUESS_BOOK, { name: "Ana", date: "2026-12-04" }), null);
    expect(parseGuessBook(JSON.stringify(book))).toEqual(book);
    expect(parseGuessBook("{not json")).toEqual(EMPTY_GUESS_BOOK);
    expect(parseGuessBook(JSON.stringify({ guesses: [{ name: "x", date: "soon" }] })).guesses).toEqual([]);
  });
});
