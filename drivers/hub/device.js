'use strict';

const Homey = require('homey');
const SolarBufferApi = require('../../lib/SolarBufferApi');

const POLL_INTERVAL = 5000;

class HubDevice extends Homey.Device {

  async onInit() {
    this.api = null;
    this.status = null;

    // Het tweede argument is het veld in het antwoord van de hub. Daar toetsen
    // we aan of de stand werkelijk moet wijzigen, en niet aan de waarde die
    // Homey toont: die zet Homey namelijk alvast goed voordat hij deze code
    // aanroept, waardoor elke vergelijking daarmee altijd gelijk uitvalt.
    this.schakelaar('onoff', 'enabled', (api, aan) => api.setRegulation(aan));
    this.schakelaar('onoff.schedules', 'schedules_enabled', (api, aan) => api.setSchedules(aan));
    this.schakelaar('onoff.legionella', 'anti_legionella_enabled', (api, aan) => api.setAntiLegionella(aan));
    this.schakelaar('onoff.vacation', 'vacation_mode', (api, aan) => api.setVacation(aan, this.status?.vacation_legionella));

    await this.maakApi();
    this.startPolling();
  }

  schakelaar(capability, hubVeld, actie) {
    this.registerCapabilityListener(capability, async (aan) => {
      this.log(`[${capability}] gevraagd: ${aan}`);
      if (!this.api) throw new Error('Vul eerst gebruikersnaam en wachtwoord in bij dit apparaat');

      // Bewust geen controle vooraf of de stand al klopt. Die controle leunde
      // op de laatst opgehaalde toestand, en die is tot vijf seconden oud.
      // Drukte je twee keer kort na elkaar, dan werd de tweede opdracht op die
      // verouderde gegevens weggefilterd en gebeurde er niets. De hub neemt een
      // gevraagde stand gewoon aan, ook als hij er al zo bij staat.
      const start = Date.now();
      try {
        await actie(this.api, aan);
        this.log(`[${capability}] verstuurd in ${Date.now() - start} ms`);
      } catch (err) {
        this.error(`[${capability}] mislukt na ${Date.now() - start} ms:`, err.message);
        throw err;
      }
      this.verversSnel();
    });
  }

  async maakApi() {
    const { username, password } = this.getSettings();
    const { address, port } = this.getStore();

    if (!username || !password) {
      await this.setUnavailable(
        'Vul gebruikersnaam en wachtwoord in bij de instellingen van dit apparaat.',
      );
      this.api = null;
      return;
    }

    this.api = new SolarBufferApi({ host: address, port: port || 5001, username, password });
  }

  /** Volgt een adreswijziging die via de aankondiging binnenkomt. */
  onDiscoveryAddressChanged(discoveryResult) {
    this.log(`Adres gewijzigd naar ${discoveryResult.address}`);
    this.setStoreValue('address', discoveryResult.address)
      .then(() => this.maakApi())
      .catch(this.error);
  }

  onDiscoveryAvailable(discoveryResult) {
    this.setStoreValue('address', discoveryResult.address).catch(this.error);
  }

  async onSettings({ changedKeys }) {
    if (changedKeys.includes('username') || changedKeys.includes('password')) {
      // Even wachten tot Homey de nieuwe waarden heeft opgeslagen.
      this.homey.setTimeout(() => this.maakApi().catch(this.error), 500);
    }
  }

  startPolling() {
    this.pollTimer = this.homey.setInterval(() => {
      this.ververs().catch((err) => this.error('Ophalen mislukt:', err.message));
    }, POLL_INTERVAL);
    this.ververs().catch((err) => this.error('Eerste ophalen mislukt:', err.message));
  }

  verversSnel() {
    // Na een schakelactie meteen de echte stand ophalen, zodat de knop in Homey
    // niet even terugspringt.
    this.homey.setTimeout(() => this.ververs().catch(this.error), 700);
  }

  async zet(capability, waarde) {
    if (waarde === null || waarde === undefined) return;
    if (this.getCapabilityValue(capability) === waarde) return;
    await this.setCapabilityValue(capability, waarde).catch(this.error);
  }

  async ververs() {
    if (!this.api) return;

    let d;
    try {
      d = await this.api.getStatus();
    } catch (err) {
      await this.setUnavailable(err.message);
      throw err;
    }

    this.status = d;
    if (!this.getAvailable()) await this.setAvailable();
    this.log(`hub: regeling=${d.enabled} schemas=${d.schedules_enabled} `
      + `legionella=${d.anti_legionella_enabled} vakantie=${d.vacation_mode}`);

    await this.zet('sb_status', d.system_status || '-');
    await this.zet('measure_power', Number(d.power) || 0);
    await this.zet('onoff', Boolean(d.enabled));
    await this.zet('onoff.schedules', Boolean(d.schedules_enabled));
    await this.zet('onoff.legionella', Boolean(d.anti_legionella_enabled));
    await this.zet('onoff.vacation', Boolean(d.vacation_mode));

    // Zon en accu heeft niet iedereen. Staan ze uit, dan halen we die metingen
    // helemaal weg in plaats van een streepje te tonen waar niets achter zit.
    const zon = this.zonVermogen(d);
    await this.regelCapability('measure_power.solar', zon !== null);
    if (zon !== null) await this.zet('measure_power.solar', zon);

    const accu = d.battery || {};
    const heeftAccu = Boolean(d.battery_enabled) && d.battery !== null;
    await this.regelCapability('sb_soc', heeftAccu && accu.soc !== null && accu.soc !== undefined);
    await this.regelCapability('measure_power.battery', heeftAccu && accu.power_w !== null && accu.power_w !== undefined);
    if (heeftAccu) {
      await this.zet('sb_soc', accu.soc !== null && accu.soc !== undefined ? Number(accu.soc) : null);
      await this.zet('measure_power.battery', accu.power_w !== null && accu.power_w !== undefined ? Number(accu.power_w) : null);
    }
  }

  /**
   * Het opgewekte vermogen, of null als deze installatie geen zonmeting heeft.
   *
   * Dat kan uit twee bronnen komen: een gekoppelde omvormer, of een of meer
   * verbruikers die als zonnemeting zijn aangevinkt. Bij die laatste nemen we
   * de hoeveelheid en niet het teken: of opwek als positief of als negatief
   * binnenkomt hangt alleen af van hoe de stroomtang om de kabel zit, en bij
   * veel installaties zit die andersom.
   */
  zonVermogen(d) {
    let totaal = null;

    if (d.inverter_enabled && d.inverter_power !== null && d.inverter_power !== undefined) {
      totaal = Number(d.inverter_power) || 0;
    }

    for (const acc of d.accessories || []) {
      if (acc.acc_type === 'temperature' || !acc.is_solar) continue;
      totaal = (totaal || 0) + Math.abs(Number(acc.power) || 0);
    }

    return totaal;
  }

  /**
   * Voegt een meting toe of haalt hem weg, al naar gelang de installatie.
   *
   * Zon en accu staan bewust niet in de vaste opsomming van dit apparaat. Zou
   * dat wel zo zijn, dan maakt Homey ze al aan bij het koppelen en legt hij er
   * meteen een geschiedenis voor aan. Die blijft daarna staan, ook als de
   * meting weer verdwijnt, en dan zie je in Insights accugegevens van een accu
   * die er nooit was.
   */
  async regelCapability(capability, nodig) {
    const aanwezig = this.hasCapability(capability);
    if (nodig && !aanwezig) {
      await this.addCapability(capability).catch(this.error);
    } else if (!nodig && aanwezig) {
      await this.removeCapability(capability).catch(this.error);
    }
  }

  /** De andere driver leest hier de toestand uit in plaats van zelf te pollen. */
  getStatus() {
    return this.status;
  }

  /**
   * Haalt nu een verse toestand op en geeft die terug.
   *
   * Nodig na een wijziging vanuit een SolarBuffer-apparaat: dat leest de
   * opgeslagen toestand van deze hub mee, en die is tot vijf seconden oud.
   * Zonder deze stap schrijft het apparaat de oude waarde terug over de
   * zojuist ingestelde, en loopt Homey zichtbaar een stap achter.
   */
  async verversNu() {
    await this.ververs();
    return this.status;
  }

  getApi() {
    return this.api;
  }

  async onDeleted() {
    if (this.pollTimer) this.homey.clearInterval(this.pollTimer);
  }

}

module.exports = HubDevice;
