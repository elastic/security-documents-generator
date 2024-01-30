# Generating fake alerts

## Getting started

### copy `config.dev.json` to `config.json`

1. Install dependecies
`npm i`

2. Change `config.json` and provide credentials for elasticsearch.

You can proide apiKey for Cloud/Serverless, or just username/password

Examles of config:

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
        "node": "http://localhost:9200",
        "username": "elastic",
        "password": "changeme"
    }
}
```



## Commands

### Entity store

`npm start entity-store` - Generate data for entity store

`npm start clean-entity-store` - Clean data for entity store

### Alerts
`npm start help` - To see the commands list

`npm start generate-alerts <n>` - Generate *n* alerts

`npm start delete-alerts` - Delete all alerts

### Api tests

`npm start test-risk-score` - Test risk score API time response


### Alert document

To modify alert document, you can change `createAlert.mjs` file.


### How to test Risk Score Api

Example list of command for testing Risk Score API woth 10.000 alerts.
```
npm start delete-alerts
npm start generate-alerts 10000
npm start test-risk-score
```

## How to generate data for serverless project

1. Get your Elasticsearch url. 
   
   Go to Cloud -> Projects -> Your serverless project.

   Then click Endpoints -> View and copy paste your ES URL to `config.json` into `elastic.node` field.

2. Generate API key

   Go to Cloud -> Projects -> Api Keys -> Manage project API keys

   Create a new API key and past it to `config.json` into `elastic.apiKey` field.

3. (Optional) Change if you want index name in `config.json` in `eventIndex` field. 
  
   By default - `my-index`

4. (Optional) Change mappings in `eventMappings.json` file.

5. (Optional) Change event structure in `createEvents.mjs` file

6. Run `npm start generate-events n`. Where `n` is the amount of documents that will be generated.

7. `npm start delete-events` to remove all documents from event index after your test.
