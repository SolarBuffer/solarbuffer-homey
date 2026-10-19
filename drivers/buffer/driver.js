'use strict';

const Homey = require('homey');

class BufferDriver extends Homey.Driver {

  async onInit() {
    this.log('SolarBuffer-driver gestart');
    this.registreerVoorwaarden();
  }

  /**
   * De kaarten onder En... lezen alleen de laatste stand; de kaarten onder
   * Als... worden vanuit het apparaat zelf afgevuurd. Draait een apparaat op
   * een oudere hub, dan bestaat de capability niet en is het antwoord nee in
   * plaats van een fout die de hele flow laat stranden.
   */
  registreerVoorwaarden() {
    const lees = (device, capability) => (device.hasCapability(capability)
      ? device.getCapabilityValue(capability)
      : null);

    this.homey.flow.getConditionCard('warmte_niveau_is')
      .registerRunListener(async (args) => {
        const niveau = lees(args.device, 'sb_warmte_niveau');
        return typeof niveau === 'number' && niveau > args.niveau;
      });

    this.homey.flow.getConditionCard('legionella_loopt')
      .registerRunListener(async (args) => lees(args.device, 'sb_legionella') === true);

    this.homey.flow.getConditionCard('doorwarming_is_nodig')
      .registerRunListener(async (args) => lees(args.device, 'sb_legionella_nodig') === true);
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
