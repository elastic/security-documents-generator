# Generating fake alerts

## Getting started

### copy `config.dev.json` to `config.json`

1. Install dependecies
`npm i`

2. Change `config.json` and provide credentials for elasticsearch.


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

6. Run `node index.mjs generate-events n`. Where `n` is the amount of documents that will be generated.

7. `node index.mjs delete-events` to remove all documents from event index after your test.



## Commands

### Alerts
`node index.mjs help` - To see the commands list

`node index.mjs generate-alerts <n>` - Generate *n* alerts

`node index.mjs delete-alerts` - Delete all alerts

### Api tests

`node index.mjs test-risk-score` - Test risk score API time response


### Alert document

To modify alert document, you can change `createAlert.mjs` file.


### How to test Risk Score Api

Example list of command for testing Risk Score API woth 10.000 alerts.
```
node index.mjs delete-alerts
node index.mjs generate-alerts 10000
node index.mjs test-risk-score
```