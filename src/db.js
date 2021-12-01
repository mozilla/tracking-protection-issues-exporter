/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

const { MongoClient } = require('mongodb');

module.exports = {
  client: null,
  async init({ dbHost, dbUser, dbPassword }) {
    if (this.client) {
      throw new Error('Already initialized');
    }
    console.info('Initializing DB connection...');

    // Connection URI
    const uri = `mongodb://${dbUser}:${dbPassword}@${dbHost}`;
    // Create a new MongoClient
    this.client = new MongoClient(uri);

    try {
      // Connect the client to the server
      await this.client.connect();
      // Establish and verify connection
      await this.client.db('admin').command({ ping: 1 });
      console.info('Connected successfully to DB');
    } catch (error) {
      // Ensures that the client will close when you finish/error
      console.error(error);
      this.uninit();
    }
  },

  async uninit() {
    await this.client.close();
    this.client = null;
  },
};
