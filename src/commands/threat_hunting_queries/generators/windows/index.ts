import { scheduledTaskCreationByActionViaRegistry } from './scheduled_task_creation_by_action_via_registry';

export const windowsGenerators = [
  scheduledTaskCreationByActionViaRegistry,
] as const;
