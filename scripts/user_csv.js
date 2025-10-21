#! /usr/bin/env node

import fs from 'fs';
import { faker } from '@faker-js/faker';


const filePath = `${process.cwd()}/data/privmon.csv`;
fs.writeFileSync(filePath, '');

for (let i = 0; i < 1000; i++) { 
    const usr = faker.internet.username();
    const line = `${usr}`;
    fs.appendFileSync(filePath, line);
    if (i < 999) {
        fs.appendFileSync(filePath, '\n');
    }
}

console.log('File generated at:', filePath);

