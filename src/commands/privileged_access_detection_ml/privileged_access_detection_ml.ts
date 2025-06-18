import {
  createPrivilegedAccessDetectionSourceIndex,
  deleteSourceIndex,
  ingestIntoSourceIndex,
} from './index_management';
import {User, UserEventGenerator} from './event_generator';

const LOGS_LINUX_INDEX = 'logs-linux';

const getAllPrivilegedAccessDetectionEvents = (
  users: User[],
) => {
  const events = [];
  const eventMultiplier = 1; // We want this value to be consistent for evenly distributed events and anomalous events

  for (const eachUser of users) {
    events.push(
      ...UserEventGenerator.evenlyDistributedEvents(eachUser, eventMultiplier),
    );
    events.push(
      ...UserEventGenerator.anomalousEvents(eachUser, eventMultiplier),
    );
  }
  return events;
};

export const generatePrivilegedAccessDetectionData = async ({
  users,
}: {
  users: User[];
}) => {
  try {
    await deleteSourceIndex(LOGS_LINUX_INDEX);
    await createPrivilegedAccessDetectionSourceIndex(LOGS_LINUX_INDEX);
    await ingestIntoSourceIndex(
      LOGS_LINUX_INDEX,
      getAllPrivilegedAccessDetectionEvents(users),
    );
  } catch (e) {
    console.log(e);
  }
};
