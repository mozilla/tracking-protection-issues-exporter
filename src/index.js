/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

const dotenv = require('dotenv');
const db = require('./db.js');
const api = require('./api.js');
const ETPReport = require('./ETPReport.js');

// Read .env file.
dotenv.config();

async function importIssueCommentsToDB({
  ghRepoUser, ghRepoName, dbDatabaseName, dbCollectionNameIssues, since,
}) {
  const issuesCollection = db.client.db(dbDatabaseName)
    .collection(dbCollectionNameIssues);

  // Create an Array for issue numbers of all issues in the database, except for
  // issues which we already imported comments for in previous runs.
  const issueNumbers = await issuesCollection.find({ comments_imported: { $ne: true } })
    .map((issue) => issue.number).toArray();
  const totalIssueCount = await issuesCollection.count();

  console.info(`Starting comment import for ${issueNumbers.length} issues out of ${totalIssueCount}.`);

  let countIssuesWithComments = 0;
  let importedCount = 0;

  for (let i = 0; i < issueNumbers.length; i += 1) {
    const number = issueNumbers[i];

    const iteratorComments = api.octokit.paginate.iterator(api.octokit.rest.issues.listComments, {
      owner: ghRepoUser,
      repo: ghRepoName,
      issue_number: number,
      per_page: 100,
      sort: 'created',
      direction: 'desc',
    });

    // eslint-disable-next-line no-await-in-loop
    for await (const { data: comments } of iteratorComments) {
      if (!comments.length) {
        continue;
      }

      // Filter comments which have been created after the given timestamp, if
      // provided.
      const dbComments = !since ? comments : comments.filter((comment) => {
        const createdAt = new Date(comment.created_at);
        return createdAt.getTime() >= since.getTime();
      });

      if (!dbComments.length) {
        console.debug('No matching comments in date range');
        break;
      }

      // Update the issue document in the DB, inserting the comments.
      await issuesCollection.updateOne({ number }, {
        $push: {
          comment_list: {
            $each: dbComments,
          },
        },
      });
      countIssuesWithComments += 1;
      importedCount += dbComments.length;

      console.info(`Imported ${dbComments.length} comments into the database.`);

      // If there are fewer comments in dbComments it means we filtered some,
      // because of time-range mismatch. Since the issues we iterate over are
      // time sorted (descending) we can exit early.
      if (dbComments.length < comments.length) {
        console.debug('hit date bound!', since);
        break;
      }
    }

    // eslint-disable-next-line no-await-in-loop
    await issuesCollection.updateOne({ number }, {
      $set: {
        comments_imported: true,
      },
    });
  }

  console.info(`Done. Imported ${importedCount} comments for ${issueNumbers.length} issues this run.`);
  console.info(`For this run, out of ${issueNumbers.length} issues ${countIssuesWithComments} had comments.`);
}

async function fetchIssues(argv) {
  await Promise.all([api.init(argv), db.init(argv)]);

  const {
    dbDatabaseName, dbCollectionNameIssues, ghRepoName, ghRepoUser, since,
  } = argv;

  const issuesCollection = db.client.db(dbDatabaseName)
    .collection(dbCollectionNameIssues);

  // For GitHub issues we can use the issue number as unique key.
  issuesCollection.createIndex({ number: 1 }, { unique: true });

  console.info('Starting to fetch issues...');

  const iterator = api.octokit.paginate.iterator(api.octokit.rest.issues.listForRepo, {
    owner: ghRepoUser,
    repo: ghRepoName,
    per_page: 100,
    sort: 'updated',
    direction: 'desc',
  });

  let importedCount = 0;
  let failedImports = 0;

  // iterate through each response
  for await (const { data: issues } of iterator) {
    try {
      // Filter issues which have been updated after the given timestamp, if
      // provided. We have to use updated_at rather than created_at, because we
      // want to include issues which have comments more recent than since.
      let dbIssues = !since ? issues : issues.filter((issue) => {
        const updatedAt = new Date(issue.updated_at);
        return updatedAt.getTime() >= since.getTime();
      });

      if (!dbIssues.length) {
        console.debug('No matching issues in date range');
        break;
      }

      // Add a comment_list field to each issue.
      dbIssues = dbIssues.map((issue) => ({
        ...issue,
        comment_list: [],
      }));

      const result = await issuesCollection.insertMany(dbIssues, { ordered: false });
      console.debug(`Received ${issues.length} issues from the API.`);
      console.info(`Imported ${result.insertedCount} issue into the database.`);

      importedCount += result.insertedCount;

      // If there are fewer issues in dbIssues it means we filtered some,
      // because of time-range mismatch. Since the issues we iterate over are
      // time sorted (descending) we can exit early.
      if (dbIssues.length < issues.length) {
        console.debug('hit date bound!', since);
        break;
      }
    } catch (error) {
      console.error('Error while importing issues', error);
      failedImports += 1;
    }
  }

  console.info(`Done. Imported ${importedCount} issues this run.`);
  console.info('Failed imports', failedImports);

  await importIssueCommentsToDB(argv);

  await Promise.all([api.uninit(), db.uninit()]);
}
async function convertIssues(argv) {
  await db.init(argv);

  const { dbDatabaseName, dbCollectionNameIssues, dbCollectionNameReports } = argv;

  const issuesCollection = db.client.db(dbDatabaseName)
    .collection(dbCollectionNameIssues);
  const reportsCollection = db.client.db(dbDatabaseName)
    .collection(dbCollectionNameReports);

  const totalParseErrors = [];
  const promises = await issuesCollection.find({}, {
    projection: {
      id: 1, number: 1, labels: 1, created_at: 1, body: 1, comment_list: 1,
    },
  }).map((issue) => {
    const { reports, parseErrors } = ETPReport.fromIssue(issue);

    parseErrors.forEach((error) => totalParseErrors.push(error));

    if (!reports.length) {
      return undefined;
    }
    return reportsCollection.insertMany(reports.map((report) => report.toDocument()));
  }).toArray();

  await Promise.all(promises);

  if (totalParseErrors.length) {
    const issueNumbers = totalParseErrors.map((error) => error.issueNumber);
    const uniqueIssueNumbers = [...new Set(issueNumbers)];
    console.warn(`Failed to parse ${uniqueIssueNumbers.length} issues/comments into reports`);
    console.debug('Issues with parse failures', uniqueIssueNumbers);
  }

  await db.uninit();
}

module.exports = { fetchIssues, convertIssues };
