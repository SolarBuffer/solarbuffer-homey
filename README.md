# SolarBuffer voor Homey

Koppelt je SolarBuffer-hub aan Homey. De app praat lokaal met de REST-API van de
hub. Geen cloud, geen tussenstappen.

## Waar dit wel en niet voor is

Je SolarBuffer regelt zelf. Hij meet je netvermogen, stuurt je boiler mee met je
zonoverschot en verdeelt het over je apparaten, ook als Homey uit staat. Deze app
voegt daar niets aan toe, maar brengt het naar de plek waar je toch al kijkt en
maakt het bruikbaar in je Flows.

## Wat je krijgt

### SolarBuffer Hub

| | Voorwaarde |
|---|---|
| Status: Actief, Opstarten, Wachten op teruglevering, Bevroren, Op temperatuur | |
| Netvermogen | |
| Regeling aan of uit | |
| Tijdschema's aan of uit | |
| Anti-legionella aan of uit | |
| Vakantiestand aan of uit | |
| Zonnevermogen | omvormer gekoppeld of een verbruiker als zonnemeting aangevinkt |
| Laadstand en vermogen van de accu | accu gekoppeld |
| Accustand, richting en vermogen | Zendure gekoppeld |

### Per SolarBuffer

Status, aan of uit, de stand, het vermogen, de energie van vandaag, en een
boost-knop.

Metingen die niet bij jouw installatie horen worden niet aangemaakt. Heb je geen
accu, dan zie je er ook niets van terug, ook niet in Insights.

## Flows

Voor het gewone werk hoef je niets in te stellen: Homey maakt zelf al kaarten
voor alles wat hierboven staat. Je kunt dus meteen bouwen op "de status is
veranderd", "de regeling ging uit", "zet de boiler op 60%" of "geef een boost".

## Installeren

De hub kondigt zichzelf aan op je netwerk, dus voeg gewoon een apparaat toe en
kies **SolarBuffer Hub**. Hij staat er dan al tussen.

Ga daarna naar de instellingen van dat apparaat en vul je gebruikersnaam en
wachtwoord van de SolarBuffer-webinterface in. Zonder die gegevens blijft het
apparaat op niet-beschikbaar staan, en dat is met opzet: zo zie je meteen dat er
nog iets moet gebeuren.

Voeg daarna nog een apparaat toe en kies **SolarBuffer**. Je boilers verschijnen
dan vanzelf, want de hub weet welke er zijn.

## Aandachtspunten

**Gebruik een beheerdersaccount.** De regeling, tijdschema's, anti-legionella en
de vakantiestand vragen die rechten. Met een kijkersaccount werken de metingen
wel, maar geven die schakelaars een foutmelding.

**Een handmatige stand werkt alleen met de regeling uit.** Staat de regeling aan,
dan rekent de hub elke paar seconden zelf een nieuwe stand uit op basis van je
overschot en is er van jouw waarde binnen enkele seconden niets meer over. De app
zegt dat ook in plaats van een schuif te tonen die stilletjes terugveert.

**Alleen Homey Pro en Homey Self-Hosted Server.** Een Homey Bridge of Homey Cloud
kan principieel niet bij apparaten op je eigen netwerk, en de hub praat alleen
lokaal.

**Een oudere hub werkt ook**, maar kent de adressen nog niet die een gevraagde
stand aannemen. De app valt dan terug op de omschakelaars van de webinterface.
Bedien je dan tegelijk vanuit Homey en vanaf de hub, dan kan de uitkomst
verrassen. Werk de hub bij om dat te voorkomen.

**De hub wordt herkend aan een vaste aanduiding**, niet aan zijn IP-adres. Krijgt
hij een nieuwe DHCP-lease, dan wordt het adres bijgewerkt in plaats van dat er
een tweede hub bij komt. De losse SolarBuffers worden nog wel aan hun IP-adres
herkend; een reservering in je router voorkomt dat ze na een adreswijziging
opnieuw verschijnen.

## Ontwikkelen

```bash
npm install -g homey
homey login
homey select          # kies je Homey Pro of Self-Hosted Server
homey app validate --level publish
homey app install
```

`homey app run` vraagt Docker op je eigen machine; `homey app install` niet.
