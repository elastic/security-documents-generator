import { URL } from "node:url";
import fetch, { Headers } from "node-fetch";
import config from "../config.json" assert { type: "json" };

export const kibanaFetch = async (url, params, apiVersion = 1) => {
  let headers = new Headers();

  headers.append("Content-Type", "application/json");
  headers.append("kbn-xsrf", "true");
  if(config.kibana.apiKey) {
    headers.set("Authorization", "ApiKey " + config.kibana.apiKey)
  } else {
    headers.set(
      "Authorization",
      "Basic " +
        Buffer.from(
          config.kibana.username + ":" + config.kibana.password
        ).toString("base64")
    );
  }
  
  headers.set("x-elastic-internal-origin", "kibana");
  headers.set("elastic-api-version", apiVersion);
  const result = await fetch(new URL(url, config.kibana.node), {
    headers: headers,
    ...params,
  });
  const data = await result.json();
  console.log(data)
  return data;
};

export const fetchRiskScore = async () => {
  return kibanaFetch(`/internal/risk_score/scores`, {
    method: "POST",
    body: JSON.stringify({}),
  });
};

export const enableRiskScore = async () => {
  return kibanaFetch(`/internal/risk_score/engine/init`, {
    method: "POST",
    body: JSON.stringify({}),
  });
};

export const assignAssetCriticality = async ({
  id_field,
  id_value,
  criticality_level,
}) => {
  return kibanaFetch(`/internal/asset_criticality`, {
    method: "POST",
    body: JSON.stringify({
      id_field,
      id_value,
      criticality_level,
    }),
  });
};

export const createRule = () => {
  return kibanaFetch(`/api/detection_engine/rules`, {
    method: "POST",
    body: JSON.stringify({
      name: "Alert Testing Query",
      description: "Tests a simple query",
      enabled: true,
      risk_score: 70,
      rule_id: 'rule-1',
      severity: "high",
      index: ['auditbeat-*'],
      type: "query",
      query: "*:*",
      from: "2024-01-01T00:00:00.000Z",
      from: 'now-1h',
      interval: '1m',
    }),
  }, "2023-10-31");
};
