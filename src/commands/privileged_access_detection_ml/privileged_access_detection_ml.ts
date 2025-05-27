import {
  createPrivilegedAccessDetectionSourceIndex,
  deleteSourceIndex,
  ingestIntoSourceIndex,
} from './index_management';
import { UserEventGenerator, UserGenerator } from './event_generator';

const getAllPrivilegedAccessDetectionEvents = (
  numberOfUsers: number,
  eventMultiplier: number,
) => {
  const events = [];

  for (const eachUser of UserGenerator.getUsers(numberOfUsers)) {
    events.push(
      ...UserEventGenerator.evenlyDistributedEvents(eachUser, eventMultiplier),
    );
    events.push(
      ...UserEventGenerator.anomalousEvents(eachUser, eventMultiplier),
    );
  }
  return events;
};

export const SUPPORTED_PAD_JOBS = [
  'pad_linux_high_count_privileged_process_events_by_user',
];

export const generatePrivilegedAccessDetectionData = async ({
  numberOfUsers,
  eventMultiplier,
}: {
  numberOfUsers: number;
  eventMultiplier: number;
}) => {
  try {
    await deleteSourceIndex();
    await createPrivilegedAccessDetectionSourceIndex();
    await ingestIntoSourceIndex(
      getAllPrivilegedAccessDetectionEvents(numberOfUsers, eventMultiplier),
    );
  } catch (e) {
    console.log(e);
  }
};
