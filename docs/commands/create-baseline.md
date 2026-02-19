# `create-baseline`

Extract metrics from logs and save a baseline file.

## Usage

```bash
yarn start create-baseline <log-prefix> [options]
```

## Options

- `-e <entityCount>`: Entity count
- `-l <logsPerEntity>`: Logs per entity
- `-u <uploadCount>`: Upload count (interval tests)
- `-i <intervalMs>`: Interval in milliseconds (interval tests)
- `-n <name>`: Custom baseline name

## Examples

```bash
# Create from one run
yarn start create-baseline small-2025-11-13T15:03:32 -e 100000 -l 5

# Create with custom baseline name
yarn start create-baseline small-2025-11-13T15:03:32 -e 100000 -l 5 -n "baseline-v1_0-standard"
```

## Notes

- Baselines are saved under `./baselines`.
