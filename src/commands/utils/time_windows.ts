import moment from 'moment/moment';
import { faker } from '@faker-js/faker';

export interface TimeWindow {
  start: moment.Moment;
  end: moment.Moment;
}

export class TimeWindows {
  static last30DayWindow = () => ({
    start: moment().subtract(30, 'days'),
    end: moment(),
  });
  static randomWindowOfOneDayInTheLastMonth = () => {
    const day = faker.helpers.rangeToNumber({ min: 2, max: 28 });
    return {
      start: moment().subtract(day, 'days'),
      end: moment().subtract(day - 1, 'days'),
    };
  };
  static toRandomTimestamp = (timeWindow: TimeWindow): string => {
    return moment(
      faker.date.between({
        from: timeWindow.start.toDate(),
        to: timeWindow.end.toDate(),
      }),
    ).format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  };
}
