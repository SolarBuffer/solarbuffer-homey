'use strict';

const Homey = require('homey');
const { zichtbaarNaarRuw, ruwNaarZichtbaar } = require('../../lib/schaal');

const POLL_INTERVAL = 5000;

class BufferDevice extends Homey.Device {

  async onInit() {
    this.registerCapabilityListener('onoff', async (aan) => {
      const { hub, api, ip } = this.hubGegevens();

      // Toetsen aan wat de hub zegt, niet aan wat Homey toont: die zet de
      // waarde alvast goed voordat deze code draait.
      const status = hub.getStatus();
      const d = status && (status.devices || []).find((x) => x.ip === ip);
      if (d && Boolean(d.on) === Boolean(aan)) return;

      await api.setDevicePower(ip, aan);
      this.verversSnel();
    });

    this.registerCapabilityListener('button', async () => {
      // Boost is bij de hub een omschakelaar: nog een keer drukken breekt een
      // lopende boost af. Dat past bij een knop, want die kent geen stand.
      const { api, ip } = this.hubGegevens();
      this.log('boost gevraagd');
      await api.boostDevice(ip);
      this.verversSnel();
    });

    this.registerCapabilityListener('dim', async (waarde) => {
      const { hub, api, ip } = this.hubGegevens();

      // Staat de automatische besturing aan, dan rekent de hub binnen een paar
      // seconden zelf een nieuwe stand uit en is hier niets meer van over. De
      // schuif zou dan terugspringen zonder dat iemand begrijpt waarom, dus
      // zeggen we het eerlijk in plaats van te doen alsof het gelukt is.
      const status = hub.getStatus();
      if (status && status.enabled) {
        throw new Error(
          'De handmatige stand werkt alleen als de regeling uit staat. '
          + 'Zet eerst de schakelaar Regeling op de hub uit.',
        );
      }

      // Homey levert 0 tot 1, de hub rekent in 0 tot 100 op de zichtbare schaal.
      const zichtbaar = Math.round(Number(waarde) * 100);
      const ruw = zichtbaarNaarRuw(zichtbaar);
      this.log(`stand gevraagd: ${zichtbaar}% (ruw ${ruw})`);
      await api.setDeviceBrightness(ip, ruw);
      this.verversSnel();
    });

    this.startPolling();
  }

  /** De hub waar dit apparaat bij hoort, met zijn verbinding. */
  hubDevice() {
    const { hubId } = this.getStore();
    const hub = this.homey.drivers.getDriver('hub')
      .getDevices()
      .find((d) => d.getData().id === hubId);
    if (!hub) throw new Error('De bijbehorende SolarBuffer Hub is niet gekoppeld');
    return hub;
  }

  hubGegevens() {
    const hub = this.hubDevice();
    const api = hub.getApi();
    if (!api) throw new Error('De hub heeft nog geen gebruikersnaam en wachtwoord');
    return { hub, api, ip: this.getStore().ip };
  }

  startPolling() {
    this.pollTimer = this.homey.setInterval(() => {
      this.ververs().catch((err) => this.error('Ophalen mislukt:', err.message));
    }, POLL_INTERVAL);
    this.ververs().catch((err) => this.error('Eerste ophalen mislukt:', err.message));
  }

  verversSnel() {
    // Eerst de hub een verse ronde laten doen, anders lezen we de toestand van
    // vóór onze eigen wijziging en springt de waarde in Homey terug.
    this.homey.setTimeout(async () => {
      try {
        const hub = this.hubDevice();
        await hub.verversNu();
        await this.ververs();
      } catch (err) {
        this.error('Verversen na wijziging mislukt:', err.message);
      }
    }, 600);
  }

  async zet(capability, waarde) {
    if (waarde === null || waarde === undefined) return;
    if (this.getCapabilityValue(capability) === waarde) return;
    await this.setCapabilityValue(capability, waarde).catch(this.error);
  }

  async ververs() {
    let hub;
    try {
      hub = this.hubDevice();
    } catch (err) {
      await this.setUnavailable(err.message);
      return;
    }

    // De hub pollt al elke vijf seconden; we lezen zijn laatste antwoord mee
    // in plaats van de hub twee keer te bevragen.
    const status = hub.getStatus();
    if (!status) return;

    const ip = this.getStore().ip;
    const d = (status.devices || []).find((x) => x.ip === ip);

    if (!d) {
      await this.setUnavailable('Deze SolarBuffer staat niet meer in de hub');
      return;
    }
    if (!this.getAvailable()) await this.setAvailable();

    const aan = Boolean(d.on);
    await this.zet('sb_status', d.status || '-');
    await this.zet('onoff', aan);
    await this.zet('measure_power', Number(d.power) || 0);
    await this.zet('meter_power', Number(d.energy_today_kwh) || 0);

    // De stand die de hub werkelijk stuurt. Met de regeling aan beweegt die
    // voortdurend mee met het zonoverschot; dat hoort zo.
    const zichtbaar = aan ? (ruwNaarZichtbaar(d.brightness) || 0) : 0;
    await this.zet('dim', Math.round(zichtbaar) / 100);
  }

  async onDeleted() {
    if (this.pollTimer) this.homey.clearInterval(this.pollTimer);
  }

}

module.exports = BufferDevice;
