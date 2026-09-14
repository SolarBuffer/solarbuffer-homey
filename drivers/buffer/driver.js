'use strict';

const Homey = require('homey');

class BufferDriver extends Homey.Driver {

  async onInit() {
    this.log('SolarBuffer-driver gestart');
  }

  /**
   * Haalt de SolarBuffers op bij een al gekoppelde hub.
   *
   * De hub weet welke apparaten er zijn en met welke inloggegevens je erbij
   * komt, dus die vraag stellen we niet nog een keer. Is er nog geen hub
   * gekoppeld, dan zeggen we dat ook, want anders krijg je een lege lijst
   * zonder uitleg.
   */
  async onPairListDevices() {
    const hubs = this.homey.drivers.getDriver('hub').getDevices();

    if (!hubs.length) {
      throw new Error(
        this.homey.__('geen_hub')
        || 'Koppel eerst je SolarBuffer Hub. Daarna verschijnen je SolarBuffers hier vanzelf.',
      );
    }

    const gevonden = [];

    for (const hub of hubs) {
      let status = hub.getStatus();
      if (!status) {
        // Net toegevoegd en nog niet opgehaald: eenmalig zelf ophalen.
        const api = hub.getApi();
        if (!api) continue;
        try {
          status = await api.getStatus();
        } catch (err) {
          this.error(`Hub ${hub.getName()} niet bereikbaar:`, err.message);
          continue;
        }
      }

      for (const apparaat of status.devices || []) {
        if (!apparaat.ip) continue;
        gevonden.push({
          name: apparaat.name || apparaat.ip,
          data: { id: `${hub.getData().id}:${apparaat.ip}` },
          store: { hubId: hub.getData().id, ip: apparaat.ip },
        });
      }
    }

    return gevonden;
  }

}

module.exports = BufferDriver;
