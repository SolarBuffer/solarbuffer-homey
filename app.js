'use strict';

const Homey = require('homey');

class SolarBufferApp extends Homey.App {

  async onInit() {
    this.log('SolarBuffer-app gestart');
  }

}

module.exports = SolarBufferApp;
