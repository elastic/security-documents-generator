import cliProgress from "cli-progress";
import {select} from "@inquirer/prompts";

export const createProgressBar = (indexName: string) => {
    return new cliProgress.SingleBar(
        {
            format: `Progress indexing into ${indexName} | {value}/{total} docs`,
        },
        cliProgress.Presets.shades_classic,
    );
}

export const promptForFileSelection = (fileList: string[]) => {

    if (fileList.length === 0) {
        console.log('No files to upload');
        process.exit(1);
    }

    return select({
        message: 'Select a file to upload',
        choices: fileList.map((file) => ({name: file, value: file})),
    });
}