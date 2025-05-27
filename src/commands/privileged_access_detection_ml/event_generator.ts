import { TimeWindow, TimeWindows } from '../utils/time_windows';
import { faker } from '@faker-js/faker';

const BASELINE_NUMBER_OF_EVENTS_PER_USER = 1000;
const ANOMALOUS_PROBABILITY_WEIGHT = 5;

interface Event {
  '@timestamp': string;
}

const createPrivilegedLinuxEvent = (timeWindow: TimeWindow, userName: string) =>
  ({
    '@timestamp': TimeWindows.toRandomTimestamp({
      start: timeWindow.start,
      end: timeWindow.end,
    }),
    user: { name: userName },
    host: {
      name: faker.database.engine(),
      os: {
        type: 'linux',
      },
    },
    event: {
      type: 'start',
      category: 'process',
    },
    process: {
      name: `process_${faker.animal.type()}`,
      command_line: faker.helpers.arrayElement([
        // For future reference, a full list of these values may be found here: https://github.com/elastic/integrations/blob/main/packages/pad/kibana/ml_module/pad-ml.json
        'pw unlock',
        'systemctl daemon-reload',
        '!tty_tickets',
      ]),
    },
  }) as Event;

class User {
  constructor(
    readonly userName: string,
    readonly numberOfAnomalousDays: number,
    readonly maxNumberOfAnomalousEvents: number,
  ) {}
}

interface UserNameByNumber {
  [userName: string]: number;
}

export class UserGenerator {
  /**
   *
   * @returns an array of Users having baseline and anomalous events
   */
  public static getUsers(numberOfUsers: number) {
    const userNames = faker.helpers.multiple(() => faker.person.fullName(), {
      count: numberOfUsers,
    });

    const usersByNumberOfAnomalousEvents =
      UserGenerator.getUsersByNumberOfAnomalousEvents(
        UserGenerator.getWeightedUserNames(userNames),
      );
    return userNames.map(
      (eachUserName) =>
        new User(
          eachUserName,
          faker.helpers.rangeToNumber({ min: 3, max: 10 }),
          usersByNumberOfAnomalousEvents[eachUserName] ?? 1,
        ),
    );
  }

  /**
   *
   * @returns an object whose keys are userNames, and whose values are the number of anomalous events that user
   * should contain.
   */
  private static getUsersByNumberOfAnomalousEvents(
    weightedUserNames: {
      weight: number;
      value: string;
    }[],
  ): UserNameByNumber {
    return faker.helpers
      .multiple(
        () => {
          return faker.helpers.weightedArrayElement(weightedUserNames);
        },
        {
          count:
            BASELINE_NUMBER_OF_EVENTS_PER_USER * ANOMALOUS_PROBABILITY_WEIGHT,
        },
      )
      .reduce((acc, next) => {
        if (acc[next]) acc[next]++;
        else acc[next] = 1;
        return acc;
      }, {} as UserNameByNumber);
  }

  /**
   * @returns userNames associated with a particular weight, in order to have a fairly random distribution of data.
   * This results in some users exhibiting more anomalous behaviors than others
   */
  private static getWeightedUserNames(userNames: string[]) {
    return userNames.map((eachUserName, index) => ({
      weight: index + 1,
      value: eachUserName,
    }));
  }
}

export class UserEventGenerator {
  /**
   * @returns Events to build a baseline of behaviors
   */
  public static evenlyDistributedEvents(
    user: User,
    eventMultiplier: number,
  ): Event[] {
    return faker.helpers.multiple(
      () => {
        return createPrivilegedLinuxEvent(
          TimeWindows.last30DayWindow(),
          user.userName,
        );
      },
      { count: BASELINE_NUMBER_OF_EVENTS_PER_USER * eventMultiplier },
    );
  }

  private static anomalousEventsForWindow(
    user: User,
    window: TimeWindow,
    eventMultiplier: number,
  ): Event[] {
    const randomNumberOfAnomalousEvents = faker.helpers.rangeToNumber({
      min: 0,
      max: user.maxNumberOfAnomalousEvents,
    });
    return faker.helpers.multiple(
      () => {
        return createPrivilegedLinuxEvent(window, user.userName);
      },
      { count: randomNumberOfAnomalousEvents * eventMultiplier },
    );
  }

  /**
   * @returns Anomalous events within day-long windows, based on the numberOfAnomalousDays. Each day will have a maximum of maxNumberOfAnomalousEvents.
   */
  public static anomalousEvents(user: User, eventMultiplier: number): Event[] {
    return faker.helpers
      .multiple(
        () => {
          const window = TimeWindows.randomWindowOfOneDayInTheLastMonth();
          return this.anomalousEventsForWindow(user, window, eventMultiplier);
        },
        { count: user.numberOfAnomalousDays },
      )
      .flat();
  }
}
