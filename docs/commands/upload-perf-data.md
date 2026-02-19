# `upload-perf-data`

Upload one Entity Store performance data file.

## Usage

```bash
yarn start upload-perf-data [file] [--index <index>] [--delete]
```

## Options

- `--index <index>`: Destination index override
- `--delete`: Delete existing entities/data before upload

## Example

```bash
yarn start upload-perf-data large --delete
```

## Notes

- If `file` is omitted, you will be prompted to pick one.
