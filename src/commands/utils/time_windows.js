import moment from 'moment/moment';
import { faker } from '@faker-js/faker';
export class TimeWindows {
}
TimeWindows.last30DayWindow = () => ({
    start: moment().subtract(30, 'days'),
    end: moment(),
});
TimeWindows.randomWindowOfOneDayInTheLastMonth = () => {
    const day = faker.helpers.rangeToNumber({ min: 2, max: 28 });
    return {
        start: moment().subtract(day, 'days'),
        end: moment().subtract(day - 1, 'days'),
    };
};
TimeWindows.toRandomTimestamp = (timeWindow) => {
    return moment(faker.date.between({
        from: timeWindow.start.toDate(),
        to: timeWindow.end.toDate(),
    })).format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
};
