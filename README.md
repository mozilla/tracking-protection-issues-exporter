# Tracking Protection Issues Exporter

NodeJS script to export GitHub issues generated from Firefox's ETP breakage
reporting UI. Issues are created by the [tracking-protection-issues
middleware](https://github.com/mozilla/tracking-protection-issues). This script
fetches  issues (+comments) via the GitHub API, parses them into individual
reports and stores them in a MongoDB database.

Due to GitHub's API limits downloading a large amount of issues and comments can
take a long time. The script will gracefully handle API failures. Failed
requests will be retried. When hitting the rate limit the script will wait for
the next (hourly) reset before continuing.

## Setup
Tested with NodeJS v12

Install dependencies via npm:
```
npm install
```

The script needs access to a MongoDB server to use as the storage backend. You
can use [Docker Compose](https://docs.docker.com/compose/) with the
`docker-compose.yml` config to start a local development server:
```
docker-compose up mongo
```

## Usage
`cli.js` implements a command line interface to download and convert issues:

```
node src/cli.js [command]

Commands:
  fetch    Fetch ETP issues from GitHub and import them into
                               a database.
  convert  Convert ETP GitHub issues into reports.

Options:
  --help                     Show help                                 [boolean]
  --version                  Show version number                       [boolean]
  --dbHost                   MongoDB database host
                                           [string] [default: "localhost:27017"]
  --dbUser                   MongoDB username                [string] [required]
  --dbPassword               MongoDB password                [string] [required]
  --dbDatabaseName           MongoDB database name
                                         [string] [default: "etp-issues-export"]
  --dbCollectionNameIssues   Name of the db collection to store issues in.
                                                    [string] [default: "issues"]
  --dbCollectionNameReports  Name of the db collection to store reports in.
                                                   [string] [default: "reports"]
```
Pass `--help` to the sub-commands to see all options. For example `node src/cli.js fetch --help`.

### Pass options via environment
Options can also be defined via environment variables, or an `.env` file in the repositories root directory:
```
EXPORT_GH_AUTH_TOKEN=<token>
EXPORT_GH_REPO_USER=<user>
EXPORT_GH_REPO_NAME=<repoName>
EXPORT_GH_API_MAX_RETRY=50
EXPORT_DB_HOST=localhost:27017
EXPORT_DB_USER=root
EXPORT_DB_PASSWORD=123456
EXPORT_DB_DATABASE_NAME=etp-reports
EXPORT_DB_COLLECTION_NAME_ISSUES=issues
EXPORT_DB_COLLECTION_NAME_REPORTS=reports
```