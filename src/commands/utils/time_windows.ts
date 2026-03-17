import dayjs from 'dayjs';
import { faker } from '@faker-js/faker';

export interface TimeWindow {
  start: dayjs.Dayjs;
  end: dayjs.Dayjs;
}

export class TimeWindows {
  static last30DayWindow = () => ({
    start: dayjs().subtract(30, 'days'),
    end: dayjs(),
  });
  static randomWindowOfOneDayInTheLastMonth = () => {
    const day = faker.helpers.rangeToNumber({ min: 2, max: 28 });
    return {
      start: dayjs().subtract(day, 'days'),
      end: dayjs().subtract(day - 1, 'days'),
    };
  };
  static toRandomTimestamp = (timeWindow: TimeWindow): string => {
    return dayjs(
      faker.date.between({
        from: timeWindow.start.toDate(),
        to: timeWindow.end.toDate(),
      }),
    ).format('YYYY-MM-DDTHH:mm:ss.SSSZ');
  };
}
