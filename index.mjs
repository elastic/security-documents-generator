#! /usr/bin/env node
import { program } from 'commander';
import { generateAlerts, deleteAllAlerts, deleteAllEvents, generateGraph, generateEvents } from './commands/documents.mjs';
import { fetchRiskScore } from './commands/risk-score.mjs';
import config from './config.json'  assert { type: "json" };

const withValidation  = (fn) => (...args) => {
  if(!config.elastic.node || !config.elastic.apiKey) {
    console.log('Please provide elastic node and apiKey in config.json')
    return;
}
return fn(...args)
}

program
  .command('generate-alerts')
  .argument('<n>', 'integer argument', parseInt)
  .description('Generate fake alerts')
  .action(withValidation(generateAlerts))


  program
  .command('generate-events')
  .argument('<n>', 'integer argument', parseInt)
  .description('Generate events')
  .action(withValidation(generateEvents))


program
  .command('generate-graph')
  // .argument('<n>', 'integer argument', parseInt)
  .description('Generate fake graph')
  .action(withValidation(generateGraph))

program
  .command('delete-alerts')
  .description('Delete all alerts')
  .action(withValidation(deleteAllAlerts))

  program
  .command('delete-events')
  .description('Delete all events')
  .action(withValidation(deleteAllEvents))

program
  .command('test-risk-score')
  .description('Test risk score API')
  .action(withValidation(fetchRiskScore))

program.parse();