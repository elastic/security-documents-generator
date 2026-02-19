# `privileged-user-monitoring` (`privmon`)

Interactive generator for privileged user monitoring datasets.

## Usage

```bash
yarn start privileged-user-monitoring [--space <space>]
```

## Options

- `--space <space>`: Kibana space (default: `default`)

## What it prompts for

- Data slices to generate (source events, anomaly events, CSV, integration sync, risk engine, criticality, PAD)
- User count
