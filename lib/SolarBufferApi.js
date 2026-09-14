'use strict';

/**
 * Praat met een SolarBuffer-hub over zijn eigen REST-API.
 *
 * De hub accepteert op elk beveiligd adres een Bearer-token, dus lezen en
 * schakelen gaan langs dezelfde weg. Die tokens overleven een herstart van de
 * hub niet, daarom loggen we bij een 401 eenmalig opnieuw in en herhalen we het
 * verzoek. Een reboot van de hub blijft daardoor onzichtbaar voor Homey.
 */
class SolarBufferApi {

  constructor({ host, port = 5001, username, password }) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
    this.token = null;
  }

  get baseUrl() {
    return `http://${this.host}:${this.port}`;
  }

  async login() {
    const res = await fetch(`${this.baseUrl}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401) {
      throw new Error('Gebruikersnaam of wachtwoord onjuist');
    }
    if (!res.ok) {
      throw new Error(`Hub gaf status ${res.status} bij het inloggen`);
    }

    const data = await res.json();
    if (!data.token) throw new Error('Hub gaf geen token terug');
    this.token = data.token;
  }

  async request(method, path, body = null, opnieuw = true) {
    if (!this.token) await this.login();

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });

    // Hub herstart, token weg. Eenmalig opnieuw inloggen en het nog eens proberen.
    if (res.status === 401 && opnieuw) {
      this.token = null;
      return this.request(method, path, body, false);
    }
    if (res.status === 401) throw new Error('Token geweigerd na opnieuw inloggen');
    if (res.status === 403) {
      throw new Error(`Geen rechten voor ${path}; dit vraagt een beheerdersaccount`);
    }
    if (res.status === 404) {
      const err = new Error(`Onbekend adres ${path}`);
      err.notFound = true;
      throw err;
    }
    if (!res.ok) throw new Error(`${path} gaf status ${res.status}`);

    const type = res.headers.get('content-type') || '';
    return type.includes('application/json') ? res.json() : res.text();
  }

  /** De volledige toestand van de hub in één keer. */
  async getStatus() {
    const data = await this.request('GET', '/status_json');
    if (typeof data !== 'object' || data === null) {
      throw new Error('Onverwacht antwoord van de hub');
    }
    return data;
  }

  /**
   * Zet een stand, en val terug op omschakelen bij een oudere hub.
   *
   * Nieuwere hubs kennen adressen die een gevraagde stand aannemen. Kent de hub
   * die nog niet, dan is er alleen een omschakelaar. De aanroeper heeft dan al
   * vastgesteld dat de stand werkelijk moet wijzigen.
   */
  async zet(pad, body, omschakelpad) {
    try {
      return await this.request('POST', pad, body);
    } catch (err) {
      if (!err.notFound) throw err;
      // Oudere hub: die kent alleen een omschakelaar. Die is niet idempotent,
      // dus daar mag alleen op gedrukt worden als de stand werkelijk afwijkt.
      // Dat is de verantwoordelijkheid van de aanroeper.
      return this.request('GET', omschakelpad);
    }
  }

  setRegulation(aan) {
    return this.zet('/api/regulation', { enabled: aan }, '/toggle_pid');
  }

  setSchedules(aan) {
    return this.zet('/api/schedules', { enabled: aan }, '/toggle_schedules');
  }

  setAntiLegionella(aan) {
    return this.zet('/api/anti_legionella', { enabled: aan }, '/toggle_anti_legionella');
  }

  setDevicePower(ip, aan) {
    return this.zet(`/api/device/${ip}/power`, { on: aan }, `/toggle_shelly/${ip}`);
  }

  /** Vaste stand voor één SolarBuffer; blijft alleen staan met de regeling uit. */
  setDeviceBrightness(ip, stand) {
    return this.request('POST', `/set_brightness/${ip}`, { brightness: stand });
  }

  boostDevice(ip) {
    return this.request('POST', `/boost/${ip}`);
  }

  setVacation(actief, legionella = false) {
    return this.request('POST', '/vacation', { active: actief, legionella });
  }

  setBatteryMode(mode, direction, power) {
    const body = { mode };
    if (direction !== undefined && direction !== null) body.direction = direction;
    if (power !== undefined && power !== null) body.power = power;
    return this.request('POST', '/api/battery/control_mode', body);
  }

}

module.exports = SolarBufferApi;
