#! /usr/bin/env node
import { program } from "commander";
import {
  generateAlerts,
  deleteAllAlerts,
  deleteAllEvents,
  generateGraph,
  generateEvents,
} from "./commands/documents";
import { fetchRiskScore } from "./commands/api";
import {
  cleanEntityStore,
  generateEntityStore,
} from "./commands/entity-store";
import inquirer from "inquirer";
import { ENTITY_STORE_OPTIONS, generateNewSeed } from "./constants";

program
  .command("generate-alerts")
  .argument("<n>", "integer argument", parseInt)
  .description("Generate fake alerts")
  .action(generateAlerts);

program
  .command("generate-events")
  .argument("<n>", "integer argument", parseInt)
  .description("Generate events")
  .action(generateEvents);

program
  .command("generate-graph")
  // .argument('<n>', 'integer argument', parseInt)
  .description("Generate fake graph")
  .action(generateGraph);

program
  .command("delete-alerts")
  .description("Delete all alerts")
  .action(deleteAllAlerts);

program
  .command("delete-events")
  .description("Delete all events")
  .action(deleteAllEvents);

program
  .command("test-risk-score")
  .description("Test risk score API")
  .action(fetchRiskScore);

type EntityStoreAnswers = {
  options: string[];
  users: number;
  hosts: number;
  seed: number;
};

program
  .command("entity-store")
  .description("Generate entity store")
  .action(
    () => {
      inquirer
        .prompt<EntityStoreAnswers>([
          {
            type: "checkbox",
            message: "Select options",
            name: "options",
            choices: [
              {
                name: "Seed (stable random data)",
                value: ENTITY_STORE_OPTIONS.seed,
                checked: true,
              },
              {
                name: "Assign asset criticality",
                value: ENTITY_STORE_OPTIONS.criticality,
                checked: true,
              },
              {
                name: "Enable Risk Engine",
                value: ENTITY_STORE_OPTIONS.riskEngine,
                checked: true,
              },
              {
                name: "Create detection rule",
                value: ENTITY_STORE_OPTIONS.rule,
                checked: true,
              },
            ],
          },
          {
            type: 'input',
            name: 'users',
            message: "How many users",
            default() {
              return 10;
            },
            filter(input) {
              return parseInt(input, 10);
            },
          },
          {
            type: 'input',
            name: 'hosts',
            message: "How many hosts",
            filter(input) {
              return parseInt(input, 10);
            },
            default() {
              return 10;
            },
          },
        ])
        .then(answers => {
          const seed = generateNewSeed();
          if (answers.options.includes(ENTITY_STORE_OPTIONS.seed)) {
            return inquirer.prompt<{ seed: number }>([
              {
                type: "input",
                name: "seed",
                message: `Enter seed to generate stable random data or <enter> to use a new seed`,
                filter(input) {
                  return parseInt(input, 10);
                },
                default() {
                  return seed;
                },
              },
            ]).then(seedAnswer => {
              return { ...answers, ...seedAnswer };
            })
          }
          return { ...answers, seed }
        })
        .then((answers) => {

          const {
            users, hosts, seed } = answers;
          generateEntityStore({
            users,
            hosts,
            seed,
            options: answers.options,
          });
        });
    }

  );

cleanEntityStore;

program
  .command("clean-entity-store")
  .description("Generate entity store")
  .action(cleanEntityStore);

program.parse();
