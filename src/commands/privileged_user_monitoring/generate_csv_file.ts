import fs from 'fs/promises';
import { resolve } from 'path';
import { log } from '../../utils/logger.ts';
import { type User } from '../privileged_access_detection_ml/event_generator.ts';
import { srcDirectory } from '../../index.ts';
import { enablePrivmon, uploadPrivmonCsv } from '../../utils/kibana_api.ts';

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

export const generateCSVFile = async ({
  users,
  upload,
  space,
}: {
  users: User[];
  upload: boolean;
  space: string;
}) => {
  try {
    const csvContent = users
      .map((user) => user.userName + ',' + generateLabelForUser(user))
      .join('\n');
    const outputDirectory = resolve(srcDirectory, `../output`);
    const csvFilePath = resolve(outputDirectory, `./${CSV_FILE_NAME}`);
    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(csvFilePath, csvContent);
    if (upload) {
      log.info('Uploading CSV file to Privileged User Monitoring...');
      log.info('First, enabling Privileged User Monitoring...');
      await enablePrivmon(space);
      log.info('Now, uploading the CSV file...');
      await uploadPrivmonCsv(csvFilePath, space);
      log.info('Upload complete.');
    }
    log.info(`A CSV file containing all of the privileged users was written to ${csvFilePath}`);
  } catch (e) {
    log.error(
      'There was a problem writing the CSV file to the local directory. See details below.',
      e,
    );
  }
};
