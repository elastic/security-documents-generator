import fs from 'fs/promises';
import { resolve } from 'path';
import { User } from '../privileged_access_detection_ml/event_generator';
import { srcDirectory } from '../../index';
import { uploadPrivmonCsv } from '../../utils/kibana_api';

const CSV_FILE_NAME = 'privileged_users.csv';

const generateLabelForUser = (user: User): string => {
  const LABELS = [
    'admin',
    'superuser',
    'Administrator',
    'root',
    'privileged',
    'power user',
    'system administrator',
    'IT support',
    'security officer',
    'network engineer',
    'database administrator',
    'cloud engineer',
  ];
  const index = user.userName.length % LABELS.length;
  return LABELS[index];
};

export const generateCSVFile = async ({ users }: { users: User[] }) => {
  try {
    const csvContent = users
      .map((user) => user.userName + ',' + generateLabelForUser(user))
      .join('\n');
    const outputDirectory = resolve(srcDirectory, `../output`);
    const csvFilePath = resolve(outputDirectory, `./${CSV_FILE_NAME}`);
    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(csvFilePath, csvContent);
    await uploadPrivmonCsv(csvFilePath);
    console.log(`A CSV file containing all of the privileged users was written to ${csvFilePath}`);
  } catch (e) {
    console.log(
      'There was a problem writing the CSV file to the local directory. See details below.'
    );
    console.error(e);
  }
};
