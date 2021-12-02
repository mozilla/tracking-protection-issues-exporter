/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

const yargs = require('yargs');
const dotenv = require('dotenv');

const { fetchIssues, convertIssues } = require('./index.js');

// Read enviroment variables from .env file.
dotenv.config();

// Configure cli options.
yargs.scriptName('etp-issues-exporter')
  .env('EXPORT')
  .option('dbHost', {
    type: 'string',
    description: 'MongoDB database host',
    default: 'localhost:27017',
  })
  .option('dbUser', {
    type: 'string',
    description: 'MongoDB username',
  })
  .option('dbPassword', {
    type: 'string',
    description: 'MongoDB password',
  })
  .option('dbDatabaseName', {
    type: 'string',
    description: 'MongoDB database name',
    default: 'etp-issues-export',
  })
  .option('dbCollectionNameIssues', {
    type: 'string',
    description: 'Name of the db collection to store issues in.',
    default: 'issues',
  })
  .option('dbCollectionNameReports', {
    type: 'string',
    description: 'Name of the db collection to store reports in.',
    default: 'reports',
  })
  .check((argv) => {
    if (argv.dbCollectionNameIssues === argv.dbCollectionNameReports) {
      throw new Error("Invalid collection name arguments: Can't use the same db collection for issues and reports.");
    }
    return true;
  })
  .demandOption(['dbUser', 'dbPassword'], 'Missing MongoDB database options.')
  .command('fetch', 'Fetch ETP issues from GitHub and import them into a database.',
    (y) => y.option('ghAuthToken', {
      type: 'string',
      description: 'Github API Auth Token',
    })
      .option('ghRepoUser', {
        type: 'string',
        description: 'Owner of the GitHub repository to download issues from.',
      })
      .option('ghRepoName', {
        type: 'string',
        description: 'Name of the GitHub repository to download issues from.',
      })
      .option('since', {
        type: 'string',
        description: 'Only fetch issues which have been updated since a given timestamp.',
        default: 0,
        coerce: ((dateStr) => new Date(dateStr)),
      })
      .check(({ since }) => {
        if (!since) {
          return true;
        }
        return (since instanceof Date) && !Number.isNaN(since.getTime());
      })
      .demandOption(['ghAuthToken', 'ghRepoUser', 'ghRepoName'], 'Missing GitHub API config'),
    fetchIssues)
  .command('convert', 'Convert ETP GitHub issues into reports.',
    () => {},
    convertIssues)
  .parse();
