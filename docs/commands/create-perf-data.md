# `create-perf-data`

Create an Entity Store performance JSONL data file.

## Usage

```bash
yarn start create-perf-data <name> <entity-count> <logs-per-entity> [start-index] [options]
```

## Options

- `--distribution <type>`: `standard` or `equal` (default: `standard`)

## Examples

```bash
# 100k entities, 5 logs each
yarn start create-perf-data large 100000 5

# Equal distribution across entity types
yarn start create-perf-data large 100000 5 0 --distribution equal
```

## Notes

- Generated files are used by `upload-perf-data` and `upload-perf-data-interval`.
- Prefer cloud or freshly provisioned environments for repeatable perf testing.
