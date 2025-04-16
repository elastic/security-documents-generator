import moment from 'moment';
import { TimeWindow } from '../types';

export const createTimestampInWindow = ({
  minTimestamp,
  maxTimestamp,
}: TimeWindow) => {
  const minMoment = moment(minTimestamp);
  const maxMoment = moment(maxTimestamp);

  if (!minMoment.isValid() || !maxMoment.isValid()) {
    throw new Error('Invalid timestamp format');
  }

  if (maxMoment.isBefore(minMoment)) {
    throw new Error('maxTimestamp cannot be before minTimestamp');
  }

  const diffMilliseconds = maxMoment.valueOf() - minMoment.valueOf();
  const randomOffset = Math.floor(Math.random() * diffMilliseconds);

  const randomTimestamp = moment(minMoment)
    .add(randomOffset, 'milliseconds')
    .format();

  return randomTimestamp;
};
