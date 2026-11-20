# Done When

[Done When](https://done-when.custd.dev) tracks progress towards a target and shows when it is likely to finish.

## Install the terminal client

Download the archive for your operating system from [GitHub Releases](https://github.com/haakco/done-when-app/releases). The
release includes Linux and macOS builds for x86-64 and ARM64, and a Windows x86-64 build. Compare the archive's SHA-256
with `SHA256SUMS`, extract it, and put `done-when` or `done-when.exe` on your PATH. Run `done-when --version` to
confirm the installation.

## Sign in

If your hosted app offers sign-in, run `done-when --host https://your-app.example login`
and open the URL it prints in a browser on the same machine. The app's OAuth client must
allow `http://localhost:43159/callback`. Done When's public site currently supports saved
items and owner links without an account.

## Work with a counter

```sh
done-when new counter --name "Pages" --target 100
done-when add "Pages" 25 --json
done-when show "Pages" --json
done-when tui
done-when watch "Pages"
```

The CLI remembers counters created on this device. Use `--json` for scripts and check the exit code before reading the
result. In `watch`, press `r` to refresh, `p` to pause or resume, and `q` to quit.

To retry a measurement, send the same key, timestamp and value. For a counter created on
the web, pass its owner link on standard input so it stays out of process arguments. Keep
the input file readable only by the account running the script.

```sh
done-when add - 25 --at 2026-11-19T09:00:00Z --idempotency-key source-reading-42 --json < owner-link.txt
```

CSV imports report each row and exit unsuccessfully if any row fails.

## Run or inspect a model

Open an existing model in Done When. Run it from a saved item name or pass its owner link
on standard input. A share link can read the latest saved results.

```sh
done-when model run - --seed 7 < owner-link.txt
done-when model show - --json < share-link.txt
```

The terminal browser shows histograms for saved models. The MCP server exposes
`run_model` for owners and `read_model_run` for owners and viewers.

## Write a project estimate

Open the project in Done When to get its owner link. Send the link on standard input
and give the earliest and latest delivery dates. `--at` records when the estimate was
made. Estimate submissions lack replay protection.

```sh
done-when remember < owner-link.txt
done-when tui
done-when estimate - --low 2026-12-10 --high 2026-12-20 --at 2026-11-19 --json < owner-link.txt
```


Share links give viewers read-only access. Keep owner links and sign-in credentials private.


## Verify hosted sign-in after deployment

Run `node scripts/check-hosted-sign-in.ts`. The check compares the app’s exact issuer
and OAuth endpoints with its provider’s live metadata. Then complete sign-in from
**My items** using an invited account and confirm the item list loads.
