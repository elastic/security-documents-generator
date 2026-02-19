# `rules`

Generate detection rules and events, with optional gaps.

## Usage

```bash
yarn start rules [options]
```

## Options

- `-r, --rules <number>`: Number of rules (default: `10`)
- `-e, --events <number>`: Number of events (default: `50`)
- `-i, --interval <string>`: Rule interval (default: `5m`)
- `-f, --from <number>`: Generate events from last N hours (default: `24`)
- `-g, --gaps <number>`: Gap count per rule (default: `0`)
- `-c, --clean`: Clean existing rules/events first
