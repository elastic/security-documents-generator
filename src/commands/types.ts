import { type Command } from 'commander';

export interface CommandModule {
  register(program: Command): void;
}
