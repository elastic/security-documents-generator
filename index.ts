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
import config from './typed_config';
import inquirer from "inquirer";
import { ENTITY_STORE_OPTIONS, generateNewSeed } from "./constants";

type CommandFn = (...args: any[]) => void | Promise<void>;

const withEsValidation =
  <F extends CommandFn>(fn: F) =>
    (...args: Parameters<F>) => {
      if (!config.elastic.node) {
        throw new Error("Please provide elastic node in config.json");
      }
      const hasApiKey = config.elastic.apiKey;
      const hasPassword = config.elastic.username && config.elastic.password;
      if (!hasApiKey && !hasPassword) {
        throw new Error(
          "Please provide elastic apiKey or username/password in config.json"
        );
      }
      return fn(...args);
    };

const withKibanaValidation =
  <F extends CommandFn>(fn: F) =>
    (...args: Parameters<F>) => {
      if (!config.kibana.node) {
        throw new Error("Please provide kibana node in config.json");
      }
      const hasPassword = config.kibana.username && config.kibana.password;
      const hasApiKey = config.kibana.apiKey;
      if (!hasApiKey && !hasPassword) {
        throw new Error(
          "Please provide kibana apiKey or username/password in config.json"
        );
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
    withKibanaValidation(
      withEsValidation(() => {
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
			  users,hosts,seed}=answers;
            generateEntityStore({
              users,
              hosts,
              seed,
              options: answers.options,
            });
          });
      })
    )
  );

cleanEntityStore;

program
  .command("clean-entity-store")
  .description("Generate entity store")
  .action(withKibanaValidation(withEsValidation(cleanEntityStore)));

program.parse();
