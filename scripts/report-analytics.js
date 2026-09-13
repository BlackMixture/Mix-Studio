#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const { summarizeAnalytics } = require('../lib/analytics-report');

function main(args) {
  if (!args.length || args.includes('--help')) {
    process.stdout.write('Usage: node scripts/report-analytics.js <events.json> [--from YYYY-MM-DD] [--to YYYY-MM-DD]\nReads a local JSON array (or {results: [...]}) and prints an aggregate-only UTC report.\nThe end date is exclusive. No network requests are made.\n');
    return;
  }
  const [file, ...flags] = args;
  const options = {};
  for (let i = 0; i < flags.length; i += 2) {
    if (!['--from', '--to'].includes(flags[i]) || !flags[i + 1]) throw new Error('Use --from and --to with ISO dates');
    options[flags[i].slice(2)] = flags[i + 1];
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  process.stdout.write(JSON.stringify(summarizeAnalytics(Array.isArray(data) ? data : data.results, options), null, 2) + '\n');
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`Analytics report failed: ${error.message}\n`); process.exitCode = 1; }
}
module.exports = { main };
