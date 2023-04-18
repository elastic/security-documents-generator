
import {URL} from 'node:url';
import fetch, { Headers } from 'node-fetch';
import config from '../config.json'  assert { type: "json" };


export const fetchRiskScore = async () => {
    let headers = new Headers();
  
    headers.append('Content-Type', 'application/json');
    headers.append('kbn-xsrf', 'true');
    headers.set('Authorization', 'Basic ' + Buffer.from(config.kibana.username + ":" + config.kibana.password).toString('base64'));
    console.time('Risk Score Api took:')
    await fetch( new URL('/internal/risk_score/scores', config.kibana.node), {
      "headers": headers,
      "body": JSON.stringify({}),
      "method": "POST",
    });
    console.timeEnd('Risk Score Api took:');
  }