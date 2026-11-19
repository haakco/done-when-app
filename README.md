# Done When

[Done When](https://done-when.custd.dev) tracks progress towards a target and shows when it is likely to finish.

## Install the terminal client

Download the archive for your operating system from [GitHub Releases](https://github.com/haakco/done-when-app/releases). The
release includes Linux and macOS builds for x86-64 and ARM64, and a Windows x86-64 build. Compare the archive's SHA-256
with `SHA256SUMS`, extract it, and put `done-when` or `done-when.exe` on your PATH. Run `done-when --version` to
confirm the installation.

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

CSV imports report each row and exit unsuccessfully if any row fails. Estimates support
`--at`. Estimate submissions lack replay protection.

Share links give viewers read-only access. Keep owner links and sign-in credentials private.
