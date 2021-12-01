/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

const UAParser = require('ua-parser-js');

module.exports = class ETPReport {
  #id;

  #issueNumber;

  #labels;

  #createdAt;

  #url;

  #userAgent;

  #preferences = [];

  #hasException;

  #userMessage;

  constructor({
    id, issueNumber, labels, createdAt, url, userAgent, preferences, hasException, userMessage,
  }) {
    this.#id = id;
    this.#issueNumber = issueNumber;
    this.#labels = labels;
    this.#createdAt = createdAt;
    this.#url = url;
    this.#userAgent = userAgent;
    this.#preferences = preferences;
    this.#hasException = hasException;
    this.#userMessage = userMessage;
  }

  static parsePreferenceValue(key, value) {
    const parseInt = (v) => Number.parseInt(v, 10);
    const parseBool = (v) => v === 'true';

    const keyToParser = {
      'privacy.trackingprotection.enabled': parseBool,
      'privacy.trackingprotection.pbmode.enabled': parseBool,
      'network.http.referer.defaultPolicy': parseInt,
      'network.http.referer.defaultPolicy.pbmode': parseInt,
      'network.cookie.cookieBehavior': parseInt,
      'network.cookie.lifetimePolicy': parseInt,
      'privacy.annotate_channels.strict_list.enabled': parseBool,
      'privacy.restrict3rdpartystorage.expiration': parseInt,
      'privacy.trackingprotection.fingerprinting.enabled': parseBool,
      'privacy.trackingprotection.cryptomining.enabled': parseBool,
    };

    const parser = keyToParser[key] || ((v) => v);
    return parser(value);
  }

  /**
   *
   * ETP report serialization code: https://searchfox.org/mozilla-central/rev/80fddabd6773cd028ec69dd4f5a2a34fcd6b4387/browser/base/content/browser-siteProtections.js#2225
   * @param {*} body
   * @returns
   */
  static parseIssueBody(body) {
    const regex = /Full URL: (.*)\r\nuserAgent: (.*)\r\n\r\n\*\*Preferences\*\*\r\n([\s\S]*?)\r\n\r\n(?:hasException: (.*)\r\n\r\n)?\*\*Comments\*\*\r\n([\s\S]*)/g;

    const regexResult = Array.from(body.matchAll(regex));
    if (!regexResult.length) {
      throw new Error('Failed to parse issue body: Regex does not match');
    }
    const [
      ,
      urlStr,
      userAgentStr,
      preferencesStr,
      hasExceptionStr,
      userMessage,
    ] = regexResult[0];

    // hasException may be unset / unknown for older ETP issues.
    let hasException = null;
    if (typeof hasExceptionStr === 'string') {
      hasException = hasExceptionStr === 'true';
    }

    const userAgent = new UAParser(userAgentStr).getResult();

    const preferences = preferencesStr.split('\r\n').map((line) => {
      const [key, value] = line.split(':');
      if (key == null || value == null || !key.length || value.length <= 1) {
        return null;
      }
      return {
        key,
        // Trim leading whitespace.
        value: ETPReport.parsePreferenceValue(key, value.substring(1)),
      };
    }).filter((obj) => !!obj);

    return {
      url: new URL(urlStr), userAgent, preferences, hasException, userMessage,
    };
  }

  /**
   * Create a list of reports from an issue. The issue itself and every issue
   * comment is a separate report.
   * @param {*} issue
   * @returns ETPReport[]
   */
  static fromIssue(issue) {
    const reports = [];
    const labels = issue.labels.map((label) => label.name);
    const parseErrors = [];

    // The issue itself and each individual issue comment is an ETP report.
    try {
      reports.push(new ETPReport({
        id: issue.id,
        issueNumber: issue.number,
        labels,
        createdAt: new Date(issue.created_at),
        ...ETPReport.parseIssueBody(issue.body),
      }));
    } catch (error) {
      error.issueNumber = issue.number;
      error.issueObj = issue;
      parseErrors.push(error);
    }

    // The field is only set if the issue has any comments.
    if (issue.comment_list) {
      issue.comment_list.forEach((comment) => {
        let commentBodyFields;
        try {
          commentBodyFields = ETPReport.parseIssueBody(comment.body);
        } catch (error) {
          error.issueNumber = issue.number;
          error.commentObj = comment;
          parseErrors.push(error);
          return;
        }

        reports.push(new ETPReport({
          id: comment.id,
          issueNumber: issue.number,
          labels,
          createdAt: new Date(comment.created_at),
          ...commentBodyFields,
        }));
      });
    }

    return { reports, parseErrors };
  }

  /**
   * Document representation of report for storage.
   * @returns
   */
  toDocument() {
    return {
      id: this.#id,
      issueNumber: this.#issueNumber,
      labels: this.#labels,
      createdAt: this.#createdAt,
      url: this.#url,
      userAgent: this.#userAgent,
      preferences: this.#preferences,
      hasException: this.#hasException,
      userMessage: this.#userMessage,
    };
  }
};
