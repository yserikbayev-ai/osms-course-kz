// Печатает моменты для листа кадров: node scripts/times.mjs L1.2
import fs from 'node:fs';
import {sheetTimes, totalSec} from '../src/beats.ts';
const props = JSON.parse(fs.readFileSync(new URL(`../props/${process.argv[2]}.json`, import.meta.url), 'utf8'));
console.log(JSON.stringify({total: totalSec(props), times: sheetTimes(props)}));
