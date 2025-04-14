# Generating fake alerts

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

5. (Optional) Change event structure in `createEvents.ts` file

6. Run `yarn start generate-events n`. Where `n` is the amount of documents that will be generated.

7. `yarn start delete-events` to remove all documents from event index after your test.

## Entity Store Performance Testing

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
yarn start upload-perf-data-interval small --deleteEntities
```

The count and interval can be customized:

```
# upload the small data file 100 times with 60 seconds between sends
yarn start upload-perf-data-interval small --deleteEntities --interval 60 --count 100
```

The entity IDs are modified before sending so that each upload creates new entities, this means there will be count * entityCount entities by the end of the test.

While the files are uploaded, we poll elasticsearch for the cluster health and the transform health, these files can be found in `./logs`. Where one file contains the cluster health every 5 seconds, and the other contains the transform health every 5 seconds:

```
> ll logs
total 464
-rw-r--r--@ 1 mark  staff    33K Oct 28 11:20 small-2024-10-28T11:14:06.828Z-cluster-health.log
-rw-r--r--@ 1 mark  staff   145K Oct 28 11:20 small-2024-10-28T11:14:06.828Z-transform-stats.log
```

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
