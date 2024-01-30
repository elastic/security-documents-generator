#! /usr/bin/env node
import { program } from "commander";
import {
  generateAlerts,
  deleteAllAlerts,
  deleteAllEvents,
  generateGraph,
  generateEvents,
} from "./commands/documents.mjs";
import { fetchRiskScore } from "./commands/api.mjs";
import {
  cleanEntityStore,
  generateEntityStore,
} from "./commands/entity-store.mjs";
import config from "./config.json" assert { type: "json" };

const withEsValidation =
  (fn) =>
  (...args) => {
    if (!config.elastic.node) {
      return console.log("Please provide elastic node in config.json");
    }
    const hasApiKey = config.elastic.apiKey;
    const hasPassword = config.elastic.username && config.elastic.password;
    if (!hasApiKey && !hasPassword) {
      console.log(
        "Please provide elastic apiKey or username/password in config.json"
      );
      return;
    }
    return fn(...args);
  };

const withKibanaValidation =
  (fn) =>
  (...args) => {
    if (!config.kibana.node) {
      return console.log("Please provide kibana node in config.json");
    }
    const hasPassword = config.kibana.username && config.kibana.password;
    if (!hasPassword) {
      console.log(
        "Please provide elastic apiKey or username/password in config.json"
      );
      return;
    }
    return fn(...args);
  };

program
  .command("generate-alerts")
  .argument("<n>", "integer argument", parseInt)
  .description("Generate fake alerts")
  .action(withEsValidation(generateAlerts));

program
  .command("generate-events")
  .argument("<n>", "integer argument", parseInt)
  .description("Generate events")
  .action(withEsValidation(generateEvents));

program
  .command("generate-graph")
  // .argument('<n>', 'integer argument', parseInt)
  .description("Generate fake graph")
  .action(withEsValidation(generateGraph));

program
  .command("delete-alerts")
  .description("Delete all alerts")
  .action(withEsValidation(deleteAllAlerts));

program
  .command("delete-events")
  .description("Delete all events")
  .action(withEsValidation(deleteAllEvents));

program
  .command("test-risk-score")
  .description("Test risk score API")
  .action(withEsValidation(fetchRiskScore));

program
  .command("entity-store")
  .description("Generate entity store")
  .action(withKibanaValidation(withEsValidation(generateEntityStore)));

program
  .command("clean-entity-store")
  .description("Generate entity store")
  .action(withKibanaValidation(withEsValidation(cleanEntityStore)));

program.parse();
