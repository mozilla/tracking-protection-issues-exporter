/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

const { Octokit } = require('octokit');
const { throttling } = require('@octokit/plugin-throttling');

// Octokit with activated throttling plugin.
const MyOctokit = Octokit.plugin(throttling);

module.exports = {
  octokit: null,
  async init({ ghAuthToken, ghMaxRetry }) {
    console.info('Initializing API connection...');
    this.octokit = new MyOctokit({
      auth: ghAuthToken,
      // Honor API rate limits
      throttle: {
        onRateLimit: (retryAfter, options) => {
          console.info(
            `Request quota exhausted for request ${options.method} ${options.url}`,
          );

          // Retry up to GH_API_MAX_RETRY times.
          if (options.request.retryCount <= ghMaxRetry) {
            console.info(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
          return false;
        },
        onAbuseLimit: (retryAfter, options) => {
          // Do not retry, only log a warning
          console.warn(
            `Abuse detected for request ${options.method} ${options.url}`,
          );
        },
      },
    });
    const { data: { login } } = await this.octokit.rest.users.getAuthenticated();
    this.octokit.log.info(`Logged in as,${login}`);
  },
  // API client is stateless, do nothing.
  uninit() {},
};
