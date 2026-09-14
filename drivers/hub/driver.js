'use strict';

const Homey = require('homey');
const SolarBufferApi = require('../../lib/SolarBufferApi');

class HubDriver extends Homey.Driver {

  async onInit() {
    this.log('Hub-driver gestart');
  }

  /**
   * Toont de hubs die zichzelf op het netwerk aankondigen.
   *
   * De hub publiceert _solarbuffer._tcp met een vaste aanduiding in het
   * txt-record. Die aanduiding is het id van het apparaat, zodat een nieuwe
   * DHCP-lease niet leidt tot een tweede hub met alles er dubbel in.
   */
  async onPairListDevices() {
    const strategy = this.getDiscoveryStrategy();
    const resultaten = Object.values(strategy.getDiscoveryResults());

    return resultaten.map((res) => ({
      // Bewust niet res.name: dat is de tekst uit de mDNS-aankondiging, en die
      // leest als "SolarBuffer op SolarBuffer". Bij meerdere hubs onderscheidt
      // het adres ze, bij één hub is de kale naam genoeg.
      name: resultaten.length > 1 ? `SolarBuffer Hub (${res.address})` : 'SolarBuffer Hub',
      data: { id: res.id || `${res.address}:${res.port}` },
      store: { address: res.address, port: res.port || 5001 },
      settings: { username: '', password: '' },
    }));
  }

  /**
   * De andere driver leent de inloggegevens van een al gekoppelde hub, zodat
   * je die niet twee keer hoeft in te vullen.
   */
  getEersteWerkendeHub() {
    const hubs = this.getDevices();
    return hubs.length ? hubs[0] : null;
  }

  maakApi({ address, port, username, password }) {
    return new SolarBufferApi({ host: address, port, username, password });
  }

}

module.exports = HubDriver;
