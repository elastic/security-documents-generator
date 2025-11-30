# Security Documents Generator
> **Note:** For compatibility with Elasticsearch 8.18 and below, checkout the tag `8.18-compatibility`.

Generate fake data for testing and development. Configure your Elasticsearch environment via basic auth or API key, and use the various commands to generate, manipulate, and clean data.

## Getting started

1. Install dependencies: `yarn`

2. Choose a command to run or simply run `yarn start`, you will be guided to generate a config file.

3. *Optional* you can change `config.json` and provide different credentials for elasticsearch at any time.

You can provide apiKey for Cloud/Serverless, or just username/password.

Examples of config:

```
{
    "elastic": {
        "node": "https://test.es.us-west2.gcp.elastic-cloud.com",
        "apiKey": "ASdlkk=="

    },
    "kibana": {
        "node": "https://test.kb.us-west2.gcp.elastic-cloud.com:9243",
        "apiKey": "asdasdasd=="
    }
}
```


```
{
    "elastic": {
        "node": "http://localhost:9200",
        "username": "elastic",
        "password": "changeme"
    },
    "kibana": {
        "node": "http://127.0.0.1:5601",
        "username": "elastic",
        "password": "changeme"
    },
    "eventIndex": ""
}
```

## Commands

### Privileged User Monitoring

`yarn start privileged-user-monitoring` - Generate source events and anomalous source data for privileged user monitoring and the privileged access detection ML jobs.

### Entity store

`yarn start entity-store` - Generate data for entity store

`yarn start clean-entity-store` - Clean data for entity store

### Alerts
`yarn start help` - To see the commands list

`yarn start generate-alerts -n <number of alerts> -h <number of hosts within the alerts> -u <number of users within the alerts> -s <optional space>`

`yarn start delete-alerts` - Delete all alerts

### API tests

`yarn start test-risk-score` - Test risk score API time response


### Alert document

To modify alert document, you can change `createAlert.ts` file.


### How to test Risk Score API

Example list of command for testing Risk Score API worth 10.000 alerts.
```
yarn start delete-alerts
yarn start generate-alerts -n 10000 -h 100 -u 100
yarn start test-risk-score
```

## How to generate data for serverless project

1. Get your Elasticsearch url. 
   
   Go to Cloud -> Projects -> Your serverless project.

   Then click Endpoints -> View and copy paste your ES URL to `config.json` into `elastic.node` field.

2. Generate API key

   Go to Cloud -> Projects -> Api Keys -> Manage project API keys

   Create a new API key and past it to `config.json` into `elastic.apiKey` field.

3. (Optional) Change if you want index name in `config.json` in `eventIndex` field. 
  
   By default - `logs-testlogs-default`

4. (Optional) Change mappings in `eventMappings.json` file.

5. (Optional) Change event structure in `create_events.ts` file

6. Run `yarn start generate-events n`. Where `n` is the amount of documents that will be generated.

7. `yarn start delete-events` to remove all documents from event index after your test.

## Entity Store Performance Testing

> **Important**: Entity store performance tests work reliably against **cloud environments** and **newly deployed environments only**.
>
> - **Running tests on the same instance is problematic** due to Elasticsearch's [node query cache](https://www.elastic.co/guide/en/elasticsearch/reference/5.1/query-cache.html), which can skew results by caching query results between test runs.
> - **Running on local instances is not stable** and should be avoided. Local environments often have resource constraints and inconsistent performance that make baseline comparisons unreliable.
>
> For accurate and comparable results, always run performance tests against a fresh cloud deployment or a newly provisioned environment.

### Sending one of the pre-built files

#### One time send

To upload a perf file once, use the `upload-perf-data` command, e.g:

```
# upload the small file, delete all logs and entities beforehand
yarn start upload-perf-data-interval small --delete
```

If you omit the file name you will be presented with a picker. 

#### Send at an interval
A better test is to send data at an interval to put the system under continued load.

To do this use the `upload-perf-data-interval` command. This will upload a file 10 times with 30 seconds between each send by default, e.g:

```
# upload the small data file 10 times with 30 seconds between sends
yarn start upload-perf-data-interval small --deleteData
```

The count and interval can be customized:

```
# upload the small data file 100 times with 60 seconds between sends
yarn start upload-perf-data-interval small --deleteData --interval 60 --count 100

# Customize the sampling interval for metrics collection (default: 5 seconds)
yarn start upload-perf-data-interval small --deleteData --interval 60 --count 100 --samplingInterval 10

# Skip transform-related operations (for ESQL workflows)
yarn start upload-perf-data-interval small --deleteData --noTransforms
```

Options:
- `--interval <seconds>` - Interval between uploads in seconds (default: 30)
- `--count <number>` - Number of times to upload (default: 10)
- `--deleteData` - Delete all entities and data streams before uploading
- `--deleteEngines` - Delete all entity engines before uploading
- `--transformTimeout <minutes>` - Timeout in minutes for waiting for generic transform to complete (default: 30)
- `--samplingInterval <seconds>` - Sampling interval in seconds for metrics collection (default: 5)
- `--noTransforms` - Skip transform-related operations (for ESQL workflows)

The entity IDs are modified before sending so that each upload creates new entities, this means there will be count * entityCount entities by the end of the test.

While the files are uploaded, we poll elasticsearch and Kibana for various metrics. These log files can be found in `./logs`:

```
> ll logs
total 464
-rw-r--r--@ 1 dg  staff   103K Nov 27 09:54 standard-2025-11-27T07:51:02.295Z-cluster-health.log
-rw-r--r--@ 1 dg  staff   486K Nov 27 09:54 standard-2025-11-27T07:51:02.295Z-kibana-stats.log
-rw-r--r--@ 1 dg  staff   429K Nov 27 09:54 standard-2025-11-27T07:51:02.295Z-node-stats.log
-rw-r--r--@ 1 dg  staff   886K Nov 27 09:54 standard-2025-11-27T07:51:02.295Z-transform-stats.log
```

The log files contain:
- **cluster-health.log**: Cluster health status, active shards, and unassigned shards (sampled every N seconds, default: 5)
- **transform-stats.log**: Transform statistics including search/index/processing latencies, document counts, and per-entity-type metrics (sampled every N seconds, default: 5). Only generated if transforms are enabled (not using `--noTransforms`)
- **node-stats.log**: Elasticsearch node statistics including CPU usage, memory heap usage, and per-node metrics (sampled every N seconds, default: 5)
- **kibana-stats.log**: Kibana statistics including event loop metrics, Elasticsearch client stats, response times, memory usage, and OS load (sampled every N seconds, default: 5)

### Baseline Metrics and Comparison

After running performance tests, you can extract metrics from the generated log files and create baselines for comparison.

#### Creating a baseline

Extract metrics from log files and save them as a baseline:

```
# Create a baseline from logs with a specific prefix
yarn start create-baseline small-2024-10-28T11:14:06.828Z -e 100000 -l 5

# Create a baseline with a custom name
yarn start create-baseline small-2024-10-28T11:14:06.828Z -e 100000 -l 5 -n "baseline-v1_0-standard"

# For interval tests, include upload count and interval
yarn start create-baseline small-2025-11-13T15:03:32 -e 100000 -l 5 -u 10 -i 30000
```

Options:
- `-e <entityCount>` - Number of entities in the test
- `-l <logsPerEntity>` - Number of logs per entity
- `-u <uploadCount>` - Number of uploads (for interval tests)
- `-i <intervalMs>` - Interval in milliseconds (for interval tests)
- `-n <name>` - Custom name for the baseline (defaults to log-prefix)

The baseline will be saved to the `./baselines` directory.

#### Listing baselines

View all available baselines:

```
yarn start list-baselines
```

#### Comparing metrics

Compare current run metrics against a baseline:

```
# Compare against the latest baseline
yarn start compare-metrics standard-2025-11-27T07:51 -e 100000 -l 5

# Compare against a specific baseline by name pattern
yarn start compare-metrics standard-2025-11-27T07:51 -b "baseline-v1_0" -e 100000 -l 5

# Customize comparison thresholds
yarn start compare-metrics standard-2025-11-27T07:51 \
  -b "baseline-v1_0" \
  -e 100000 -l 5 \
  --degradation-threshold 20 \
  --warning-threshold 10 \
  --improvement-threshold 10
```

Options:
- `-b <baseline>` - Path to baseline file or pattern to match (uses latest if not specified)
- `-e <entityCount>` - Number of entities for current run
- `-l <logsPerEntity>` - Number of logs per entity for current run
- `-u <uploadCount>` - Number of uploads for current run
- `-i <intervalMs>` - Interval in milliseconds for current run
- `--degradation-threshold <percent>` - Percentage worse to be considered degradation (default: 20)
- `--warning-threshold <percent>` - Percentage worse to be considered warning (default: 10)
- `--improvement-threshold <percent>` - Percentage better to be considered improvement (default: 10)

The comparison report shows metrics including:
- **Latency metrics**: Search, Intake, and Processing latencies (avg, p50, p95, p99, max)
- **System metrics**: CPU, Memory, Throughput, Index Efficiency
- **Entity metrics**: Per-entity-type metrics (host, user, service, generic)
- **Error metrics**: Search failures, Index failures
- **Kibana metrics**: Event loop, Elasticsearch client, Response times, Memory, Requests, OS Load


### Generating a data file

To generate a data file for performance testing, use the `create-perf-data` command. 

E.g this is how 'large' was created:

```
# create a file with 100k entities each with 5 logs.
yarn start create-perf-data large 100000 5
```

Entities are split 50/50 host/user.
The log messages created contain incremental data, e.g the first log message for a host would contain IP 192.168.1.0 and 192.168.1.1, the second log would contain 192.168.1.2 and 192.168.1.3. This way when 5 log messages are sent, an entity should have 10 IP addresses ranging from 0 - 10. 


### Generate rules and gaps

Will generate 100 rules with 10000 gaps per rule.

`yarn start rules --rules 100 -g 10000 -c -i"48h"`
