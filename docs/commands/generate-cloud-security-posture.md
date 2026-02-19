# `generate-cloud-security-posture` (`csp`)

Generate Cloud Security Posture findings across Elastic-native and third-party sources.

## Usage

```bash
yarn start generate-cloud-security-posture [options]
# alias
yarn start csp [options]
```

## Options

- `--seed <seed>`: Random seed for reproducibility
- `--data-sources <list>`: Comma-separated sources (default: `all`)
- `--findings-count <n>`: Findings per data source (default: `50`)
- `--csp-scores`: Generate historical CSP score trend data

## Data source shortcuts

- `all`
- `elastic_all`

## Data sources

- Elastic: `elastic_cspm_aws`, `elastic_cspm_gcp`, `elastic_cspm_azure`, `elastic_kspm_vanilla`, `elastic_kspm_eks`, `elastic_cnvm`
- Third-party: `wiz_misconfigs`, `wiz_vulnerabilities`, `qualys_vulnerabilities`, `tenable_vulnerabilities`, `aws_misconfigs`
