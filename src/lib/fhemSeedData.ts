import type {DeviceHistoryPoint, FhemEventItem, FhemLogEntry, FhemRawDevice} from '../types/fhem';

function formatFhemTime(offsetMinutesAgo = 0): string {
  const d = new Date(Date.now() - offsetMinutesAgo * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function makeRawDevice(params: {
  name: string;
  type: string;
  def: string;
  alias: string;
  room: string;
  state: string;
  model?: string;
  webCmd?: string;
  group?: string;
  icon?: string;
  comment?: string;
  disable?: string;
  possibleSets?: string;
  readings?: Record<string, string>;
  extraAttrs?: Record<string, string>;
  minutesAgo?: number;
}): FhemRawDevice {
  const ts = formatFhemTime(params.minutesAgo ?? 3);
  const readingsObj: Record<string, {Value: string; Time: string}> = {
    state: {Value: params.state, Time: ts},
  };
  if (params.readings) {
    for (const [k, v] of Object.entries(params.readings)) {
      readingsObj[k] = {Value: v, Time: ts};
    }
  }

  const attributes: Record<string, string> = {
    alias: params.alias,
    room: params.room,
  };
  if (params.model) attributes.model = params.model;
  if (params.webCmd) attributes.webCmd = params.webCmd;
  if (params.group) attributes.group = params.group;
  if (params.icon) attributes.icon = params.icon;
  if (params.comment) attributes.comment = params.comment;
  if (params.disable) attributes.disable = params.disable;
  if (params.extraAttrs) Object.assign(attributes, params.extraAttrs);

  return {
    Name: params.name,
    PossibleSets: params.possibleSets || 'on off toggle',
    PossibleAttrs: 'alias room group webCmd icon comment disable devStateIcon event-on-change-reading appOptions',
    Internals: {
      NAME: params.name,
      TYPE: params.type,
      DEF: params.def,
      STATE: params.state,
      NR: String(Math.floor(Math.random() * 400) + 10),
    },
    Readings: readingsObj,
    Attributes: attributes,
  };
}

export function createInitialFhemDevices(): FhemRawDevice[] {
  const list: FhemRawDevice[] = [];

  // 1. Flagship Interactive Devices (Favorites & Primary Room Controls)
  const flagship: FhemRawDevice[] = [
    makeRawDevice({
      name: 'HUEDevice_WZ_Decke',
      type: 'HUEDevice',
      def: '11 IODev=ZigBee_Bridge',
      alias: 'Deckenleuchte Wohnzimmer',
      room: 'Wohnzimmer,ZigBee',
      state: 'on',
      model: 'LCT015 Philips Hue White & Color',
      webCmd: 'on:off:pct:ct:rgb',
      group: 'Beleuchtung',
      possibleSets: 'on off toggle pct:slider,0,1,100 ct:slider,2200,100,6500 rgb',
      readings: {pct: '78', bri: '198', ct: '2900', rgb: 'FFD4A3', reachable: '1', linkquality: '164'},
      extraAttrs: {
        appOptions: JSON.stringify({
          template: 'light',
          dashboard: true,
          size: 'wide',
          sortby: 1,
          info: {left1: 'ct'},
        }),
      },
      minutesAgo: 2,
    }),
    makeRawDevice({
      name: 'HUEDevice_WZ_Stehlampe',
      type: 'HUEDevice',
      def: '12 IODev=ZigBee_Bridge',
      alias: 'Stehlampe Sofa',
      room: 'Wohnzimmer,ZigBee',
      state: 'on',
      model: 'LCA006 Philips Hue White & Color',
      webCmd: 'on:off:pct:ct:rgb',
      group: 'Beleuchtung',
      possibleSets: 'on off toggle pct:slider,0,1,100 ct:slider,2200,100,6500 rgb',
      readings: {pct: '45', bri: '114', ct: '2500', rgb: 'FFB366', reachable: '1', linkquality: '148'},
      extraAttrs: {
        appOptions: JSON.stringify({template: 'light', dashboard: true, size: 'sm', sortby: 2}),
      },
      minutesAgo: 6,
    }),
    makeRawDevice({
      name: 'HUEDevice_WZ_TV_Strip',
      type: 'HUEDevice',
      def: '13 IODev=ZigBee_Bridge',
      alias: 'TV Ambilight LED-Strip',
      room: 'Wohnzimmer,ZigBee',
      state: 'off',
      model: 'LST004 Hue Lightstrip Plus',
      webCmd: 'on:off:pct:rgb',
      group: 'Beleuchtung',
      possibleSets: 'on off toggle pct:slider,0,1,100 ct:slider,2200,100,6500 rgb',
      readings: {pct: '0', bri: '0', ct: '3200', rgb: '4F46E5', reachable: '1', linkquality: '152'},
      minutesAgo: 38,
    }),
    makeRawDevice({
      name: 'ZB_Thermostat_WZ',
      type: 'MQTT2_DEVICE',
      def: 'zigbee_trv_wz',
      alias: 'Heizkörper Wohnzimmer',
      room: 'Wohnzimmer,Klima,ZigBee',
      state: 'T: 21.4 desired: 21.5 valve: 32%',
      model: 'Bosch BTH-RA ZigBee TRV',
      webCmd: 'desired-temp:auto:manual:boost',
      group: 'Heizung',
      possibleSets: 'desired-temp:slider,12,0.5,28 auto manual boost',
      extraAttrs: {
        appOptions: JSON.stringify({
          template: 'thermostat',
          dashboard: true,
          size: 'wide',
          sortby: 3,
        }),
      },
      readings: {
        temperature: '21.4',
        'measured-temp': '21.4',
        'desired-temp': '21.5',
        valve: '32',
        controlMode: 'auto',
        batteryPercent: '86',
        linkquality: '142',
      },
      minutesAgo: 1,
    }),
    makeRawDevice({
      name: 'HM_Rollladen_WZ_Terrasse',
      type: 'HMCCUDEV',
      def: '00111A4992C101',
      alias: 'Rollladen Terrasse',
      room: 'Wohnzimmer,Rollläden',
      state: 'pct 100',
      model: 'HmIP-BROLL',
      webCmd: 'up:stop:down:pct',
      group: 'Beschattung',
      possibleSets: 'up down stop pct:slider,0,5,100',
      readings: {pct: '100', level: '100', motor: 'stop', rssi: '-64'},
      minutesAgo: 14,
    }),
    makeRawDevice({
      name: 'HM_Rollladen_WZ_Links',
      type: 'HMCCUDEV',
      def: '00111A4992C102',
      alias: 'Rollladen Wohnzimmer Links',
      room: 'Wohnzimmer,Rollläden',
      state: 'pct 65',
      model: 'HmIP-BROLL',
      webCmd: 'up:stop:down:pct',
      group: 'Beschattung',
      possibleSets: 'up down stop pct:slider,0,5,100',
      readings: {pct: '65', level: '65', motor: 'stop', rssi: '-68'},
      minutesAgo: 25,
    }),
    makeRawDevice({
      name: 'ZB_Sensor_WZ_Klima',
      type: 'MQTT2_DEVICE',
      def: 'zigbee_aqara_wz_th',
      alias: 'Raumklima Wohnzimmer',
      room: 'Wohnzimmer,Sensoren,ZigBee',
      state: 'T: 21.4 H: 48%',
      model: 'Aqara WSDCGQ11LM',
      group: 'Klima',
      possibleSets: 'getConfig',
      readings: {
        temperature: '21.4',
        humidity: '48',
        pressure: '1014.2',
        batteryPercent: '92',
        linkquality: '158',
      },
      minutesAgo: 1,
    }),
    makeRawDevice({
      name: 'HUEDevice_Kueche_Arbeitsplatte',
      type: 'HUEDevice',
      def: '14 IODev=ZigBee_Bridge',
      alias: 'Arbeitsplatte Küche',
      room: 'Küche,ZigBee',
      state: 'on',
      model: 'IKEA TRÅDFRI LED Driver 30W',
      webCmd: 'on:off:pct',
      group: 'Beleuchtung',
      possibleSets: 'on off toggle pct:slider,0,1,100',
      readings: {pct: '90', bri: '229', reachable: '1', linkquality: '134'},
      minutesAgo: 4,
    }),
    makeRawDevice({
      name: 'ZB_Plug_Kaffee',
      type: 'MQTT2_DEVICE',
      def: 'zigbee_plug_kaffee',
      alias: 'Espressomaschine',
      room: 'Küche,ZigBee',
      state: 'on',
      model: 'Aqara SP-EUC01 Smart Plug',
      webCmd: 'on:off:toggle',
      group: 'Steckdosen',
      possibleSets: 'on off toggle',
      readings: {power: '18.4', energy: '142.6', voltage: '231', current: '0.09', linkquality: '129'},
      minutesAgo: 1,
    }),
    makeRawDevice({
      name: 'ZB_Fenster_Buero',
      type: 'MQTT2_DEVICE',
      def: 'zigbee_contact_buero',
      alias: 'Fensterkontakt Büro',
      room: 'Büro,Sensoren,ZigBee',
      state: 'open',
      model: 'Aqara MCCGQ11LM',
      group: 'Fenster & Türen',
      possibleSets: 'getConfig',
      readings: {contact: 'open', batteryPercent: '74', linkquality: '119'},
      minutesAgo: 9,
    }),
    makeRawDevice({
      name: 'HM_Rollladen_SZ_Fenster',
      type: 'HMCCUDEV',
      def: '00111A4992C108',
      alias: 'Rollladen Schlafzimmer',
      room: 'Schlafzimmer,Rollläden',
      state: 'pct 20',
      model: 'HmIP-BROLL',
      webCmd: 'up:stop:down:pct',
      group: 'Beschattung',
      possibleSets: 'up down stop pct:slider,0,5,100',
      readings: {pct: '20', level: '20', motor: 'stop', rssi: '-71'},
      minutesAgo: 41,
    }),
    makeRawDevice({
      name: 'ZB_Thermostat_Bad',
      type: 'MQTT2_DEVICE',
      def: 'zigbee_trv_bad',
      alias: 'Heizung Badezimmer',
      room: 'Bad,Klima,ZigBee',
      state: 'T: 22.8 desired: 23.0 valve: 45%',
      model: 'Bosch BTH-RA ZigBee TRV',
      webCmd: 'desired-temp:auto:manual:boost',
      group: 'Heizung',
      possibleSets: 'desired-temp:slider,12,0.5,28 auto manual boost',
      readings: {
        temperature: '22.8',
        'measured-temp': '22.8',
        'desired-temp': '23.0',
        valve: '45',
        controlMode: 'auto',
        batteryPercent: '68',
        linkquality: '112',
      },
      minutesAgo: 2,
    }),
    makeRawDevice({
      name: 'ZB_Sensor_Garten_Klima',
      type: 'MQTT2_DEVICE',
      def: 'zigbee_sensor_garten',
      alias: 'Außensensor Terrasse',
      room: 'Garten,Sensoren,ZigBee',
      state: 'T: 8.6 H: 76%',
      model: 'Sonoff SNZB-02D',
      group: 'Wetter',
      possibleSets: 'getConfig',
      readings: {
        temperature: '8.6',
        humidity: '76',
        batteryPercent: '14',
        battery: 'low',
        linkquality: '64',
      },
      minutesAgo: 5,
    }),
    makeRawDevice({
      name: 'ZB_Plug_ServerRack',
      type: 'MQTT2_DEVICE',
      def: 'zigbee_plug_rack',
      alias: 'Server-Rack & NAS',
      room: 'Technik,ZigBee',
      state: 'on',
      model: 'Nous A1Z ZigBee Plug',
      webCmd: 'on:off',
      group: 'Energie',
      possibleSets: 'on off toggle',
      readings: {power: '84.2', energy: '612.8', voltage: '232', current: '0.37', linkquality: '188'},
      minutesAgo: 1,
    }),
    makeRawDevice({
      name: 'ZB_Sensor_Garten_Tor',
      type: 'MQTT2_DEVICE',
      def: 'zigbee_contact_gartentor',
      alias: 'Gartentor Kontakt',
      room: 'Garten,Sensoren,ZigBee',
      state: 'offline',
      model: 'Aqara MCCGQ11LM',
      group: 'Sicherheit',
      possibleSets: 'getConfig',
      readings: {contact: 'closed', availability: 'offline', batteryPercent: '8', battery: 'low', linkquality: '12', lastError: 'Device timed out (24h)'},
      minutesAgo: 145,
    }),
    makeRawDevice({
      name: 'ZigBee_Bridge',
      type: 'MQTT2_DEVICE',
      def: 'zigbee2mqtt_bridge',
      alias: 'ZigBee2MQTT Koordinator',
      room: 'Technik,ZigBee',
      state: 'online',
      model: 'SONOFF ZBDongle-P CC2652P',
      webCmd: 'permit_join:restart',
      group: 'System',
      possibleSets: 'permit_join restart log_level',
      readings: {
        state: 'online',
        version: '1.42.0',
        coordinator: 'zStack3x0 20240710',
        devices_count: '108',
        permit_join: 'false',
      },
      minutesAgo: 1,
    }),
    makeRawDevice({
      name: 'FHEM_System',
      type: 'SYSMON',
      def: '1 1 1 10',
      alias: 'Raspberry Pi 5 FHEM Host',
      room: 'Technik',
      state: 'Active',
      model: 'Raspberry Pi 5 8GB',
      group: 'System',
      possibleSets: 'update',
      readings: {
        cpu_temp: '44.2',
        loadavg: '0.18 0.22 0.19',
        ram: 'Total: 7942 MB, Used: 1412 MB (17.8%)',
        uptime_text: '42 Tage, 11 Std, 28 Min',
      },
      minutesAgo: 1,
    }),
  ];

  list.push(...flagship);

  // 2. Programmatically generate realistic Smart Home rooms up to ~200 devices (>105 ZigBee)
  const roomConfigs: Array<{
    room: string;
    short: string;
    baseTemp: number;
    lights: Array<{id: string; alias: string; on: boolean; pct: number; zigbee: boolean; dimmable: boolean; model: string}>;
    shutters: Array<{id: string; alias: string; pct: number}>;
    thermostats: Array<{id: string; alias: string; desired: number; measured: number; valve: number; zigbee: boolean}>;
    plugs: Array<{id: string; alias: string; on: boolean; power: number; zigbee: boolean}>;
    sensors: Array<{id: string; alias: string; kind: 'climate' | 'contact' | 'motion' | 'smoke' | 'leak' | 'co2'; state: string; zigbee: boolean; battery: number; lqi: number; extra?: Record<string, string>}>;
  }> = [
    {
      room: 'Wohnzimmer',
      short: 'WZ',
      baseTemp: 21.4,
      lights: [
        {id: 'Esstisch', alias: 'Esstisch Pendelleuchte', on: true, pct: 65, zigbee: true, dimmable: true, model: 'Hue Ensis'},
        {id: 'Vitrine', alias: 'Vitrine Akzentlicht', on: false, pct: 0, zigbee: true, dimmable: true, model: 'IKEA TRÅDFRI E14'},
        {id: 'Leselampe', alias: 'Leselampe Sessel', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Hue White E27'},
        {id: 'Sideboard', alias: 'Sideboard LED', on: true, pct: 35, zigbee: true, dimmable: true, model: 'Gledopto GL-C-008'},
        {id: 'Deckenspot_1', alias: 'Deckenspot Nord', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Hue Centura GU10'},
        {id: 'Deckenspot_2', alias: 'Deckenspot Süd', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Hue Centura GU10'},
      ],
      shutters: [
        {id: 'Rechts', alias: 'Rollladen Wohnzimmer Rechts', pct: 100},
        {id: 'Erker', alias: 'Rollladen Erker', pct: 80},
      ],
      thermostats: [
        {id: 'Essbereich', alias: 'Heizkörper Essbereich', desired: 21.5, measured: 21.2, valve: 28, zigbee: true},
      ],
      plugs: [
        {id: 'HiFi', alias: 'AV-Receiver & Subwoofer', on: true, power: 42.5, zigbee: true},
        {id: 'Subwoofer', alias: 'TV Media Konsole', on: true, power: 19.2, zigbee: false},
        {id: 'Weihnacht', alias: 'Fensterbank Steckdose', on: false, power: 0, zigbee: true},
      ],
      sensors: [
        {id: 'Terrassentuer', alias: 'Terrassentür Kontakt', kind: 'contact', state: 'closed', zigbee: true, battery: 88, lqi: 144},
        {id: 'Fenster_Links', alias: 'Fenster Wohnzimmer Links', kind: 'contact', state: 'closed', zigbee: true, battery: 81, lqi: 138},
        {id: 'Fenster_Rechts', alias: 'Fenster Wohnzimmer Rechts', kind: 'contact', state: 'closed', zigbee: true, battery: 79, lqi: 132},
        {id: 'Bewegung', alias: 'Präsenzmelder Wohnzimmer', kind: 'motion', state: 'motion', zigbee: true, battery: 100, lqi: 162, extra: {illuminance: '185'}},
        {id: 'Rauchmelder', alias: 'Rauchmelder Wohnzimmer', kind: 'smoke', state: 'ok', zigbee: true, battery: 95, lqi: 151},
        {id: 'CO2', alias: 'Luftqualität Wohnzimmer', kind: 'co2', state: '680 ppm', zigbee: false, battery: 100, lqi: 180, extra: {co2: '680', temperature: '21.4', humidity: '48'}},
      ],
    },
    {
      room: 'Küche',
      short: 'Kueche',
      baseTemp: 20.6,
      lights: [
        {id: 'Decke', alias: 'Deckenpanel Küche', on: true, pct: 85, zigbee: true, dimmable: true, model: 'Hue Aurelle Panel'},
        {id: 'Insel', alias: 'Kochinsel Spots', on: false, pct: 0, zigbee: true, dimmable: true, model: 'IKEA GU10 ZigBee'},
        {id: 'Oberschrank', alias: 'Oberschrank Indirekt', on: true, pct: 50, zigbee: true, dimmable: true, model: 'Innr Flex Strip'},
        {id: 'Speisekammer', alias: 'Speisekammer Licht', on: false, pct: 0, zigbee: true, dimmable: false, model: 'Sonoff ZBMINI-L2'},
      ],
      shutters: [
        {id: 'Fenster', alias: 'Rollladen Küche', pct: 100},
      ],
      thermostats: [
        {id: 'Heizung', alias: 'Heizkörper Küche', desired: 20.5, measured: 20.6, valve: 15, zigbee: true},
      ],
      plugs: [
        {id: 'Spuelmaschine', alias: 'Geschirrspüler Leistung', on: true, power: 2.1, zigbee: false},
        {id: 'Kuehlschrank', alias: 'Kühlschrank Energiemesser', on: true, power: 46.8, zigbee: false},
        {id: 'Mikrowelle', alias: 'Küchengeräte Leiste', on: false, power: 0, zigbee: true},
      ],
      sensors: [
        {id: 'Klima', alias: 'Temperatur Küche', kind: 'climate', state: 'T: 20.6 H: 52%', zigbee: true, battery: 84, lqi: 136, extra: {temperature: '20.6', humidity: '52'}},
        {id: 'Fenster', alias: 'Küchenfenster Kontakt', kind: 'contact', state: 'closed', zigbee: true, battery: 90, lqi: 141},
        {id: 'Wassermelder', alias: 'Wassermelder Spüle', kind: 'leak', state: 'dry', zigbee: true, battery: 96, lqi: 127},
        {id: 'Bewegung', alias: 'Bewegungsmelder Küche', kind: 'motion', state: 'nomotion', zigbee: true, battery: 82, lqi: 148, extra: {illuminance: '240'}},
        {id: 'Rauchmelder', alias: 'Hitzemelder Küche', kind: 'smoke', state: 'ok', zigbee: true, battery: 91, lqi: 133},
      ],
    },
    {
      room: 'Schlafzimmer',
      short: 'SZ',
      baseTemp: 18.4,
      lights: [
        {id: 'Decke', alias: 'Deckenleuchte Schlafzimmer', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Hue Being'},
        {id: 'Nachttisch_L', alias: 'Nachttisch Links', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Hue Go V2'},
        {id: 'Nachttisch_R', alias: 'Nachttisch Rechts', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Hue White Ambiance'},
        {id: 'Schrank', alias: 'Kleiderschrank LED', on: false, pct: 0, zigbee: true, dimmable: true, model: 'IKEA MITTLED ZigBee'},
        {id: 'Bett_Unter', alias: 'Bett Nachtlicht', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Hue Lightstrip'},
      ],
      shutters: [
        {id: 'Balkon', alias: 'Rollladen Schlafzimmer Balkon', pct: 25},
      ],
      thermostats: [
        {id: 'Heizung', alias: 'Heizkörper Schlafzimmer', desired: 18.0, measured: 18.4, valve: 0, zigbee: true},
      ],
      plugs: [
        {id: 'Ladestation', alias: 'Nachttisch Ladestation', on: true, power: 4.6, zigbee: true},
        {id: 'Luftreiniger', alias: 'Luftreiniger Schlafzimmer', on: false, power: 0, zigbee: true},
      ],
      sensors: [
        {id: 'Klima', alias: 'Raumklima Schlafzimmer', kind: 'climate', state: 'T: 18.4 H: 54%', zigbee: true, battery: 77, lqi: 121, extra: {temperature: '18.4', humidity: '54'}},
        {id: 'Fenster', alias: 'Fenster Schlafzimmer', kind: 'contact', state: 'closed', zigbee: true, battery: 83, lqi: 118},
        {id: 'Balkontuer', alias: 'Balkontür Schlafzimmer', kind: 'contact', state: 'closed', zigbee: true, battery: 72, lqi: 114},
        {id: 'Bewegung', alias: 'Nachtlicht Sensor Bett', kind: 'motion', state: 'nomotion', zigbee: true, battery: 88, lqi: 129},
        {id: 'Rauchmelder', alias: 'Rauchmelder Schlafzimmer', kind: 'smoke', state: 'ok', zigbee: true, battery: 94, lqi: 125},
      ],
    },
    {
      room: 'Büro',
      short: 'Buero',
      baseTemp: 21.8,
      lights: [
        {id: 'Decke', alias: 'Büro Deckenleuchte', on: true, pct: 100, zigbee: true, dimmable: true, model: 'Hue Surimu Panel'},
        {id: 'Schreibtisch', alias: 'Monitor Lightbar', on: true, pct: 80, zigbee: true, dimmable: true, model: 'ZigBee LED Dimmer'},
        {id: 'Regal', alias: 'Bücherregal Spot', on: false, pct: 0, zigbee: true, dimmable: true, model: 'IKEA TRÅDFRI GU10'},
        {id: 'Hintergrund', alias: 'Video-Call Keylight', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Hue Play Bar'},
      ],
      shutters: [
        {id: 'Fenster_1', alias: 'Rollladen Büro Ost', pct: 75},
        {id: 'Fenster_2', alias: 'Rollladen Büro Süd', pct: 50},
      ],
      thermostats: [
        {id: 'Heizung', alias: 'Heizkörper Büro', desired: 21.5, measured: 21.8, valve: 18, zigbee: true},
      ],
      plugs: [
        {id: 'Workstation', alias: 'Workstation & Monitore', on: true, power: 138.4, zigbee: true},
        {id: 'Drucker', alias: 'Laserdrucker', on: false, power: 0, zigbee: true},
        {id: 'Lader', alias: 'USB-C Hub', on: true, power: 14.2, zigbee: false},
      ],
      sensors: [
        {id: 'Klima', alias: 'Raumklima Büro', kind: 'climate', state: 'T: 21.8 H: 44%', zigbee: true, battery: 91, lqi: 155, extra: {temperature: '21.8', humidity: '44'}},
        {id: 'CO2', alias: 'CO2-Sensor Büro', kind: 'co2', state: '820 ppm', zigbee: false, battery: 100, lqi: 176, extra: {co2: '820', temperature: '21.8', humidity: '44'}},
        {id: 'Bewegung', alias: 'Präsenzmelder Schreibtisch', kind: 'motion', state: 'motion', zigbee: true, battery: 100, lqi: 168},
        {id: 'Tuer', alias: 'Bürotür Kontakt', kind: 'contact', state: 'open', zigbee: true, battery: 86, lqi: 152},
      ],
    },
    {
      room: 'Bad',
      short: 'Bad',
      baseTemp: 22.8,
      lights: [
        {id: 'Decke', alias: 'Deckenlicht Bad', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Hue Adore IP44'},
        {id: 'Spiegel', alias: 'Spiegelschrank LED', on: true, pct: 70, zigbee: true, dimmable: true, model: 'Hue Adore Mirror'},
        {id: 'Dusche', alias: 'Dusch-Spot', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Paulmann ZigBee IP44'},
        {id: 'Nacht', alias: 'Orientierungslicht Bad', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Aqara Nightlight'},
      ],
      shutters: [
        {id: 'Fenster', alias: 'Rollladen Badezimmer', pct: 100},
      ],
      thermostats: [
        {id: 'Handtuch', alias: 'Handtuchheizkörper', desired: 23.0, measured: 22.6, valve: 35, zigbee: true},
      ],
      plugs: [
        {id: 'Luefter', alias: 'Bad-Abluftventilator', on: false, power: 0, zigbee: false},
        {id: 'Spiegelheizung', alias: 'Spiegelheizung', on: false, power: 0, zigbee: true},
      ],
      sensors: [
        {id: 'Klima', alias: 'Feuchtesensor Bad', kind: 'climate', state: 'T: 22.8 H: 61%', zigbee: true, battery: 69, lqi: 110, extra: {temperature: '22.8', humidity: '61'}},
        {id: 'Fenster', alias: 'Badfenster Kontakt', kind: 'contact', state: 'closed', zigbee: true, battery: 75, lqi: 108},
        {id: 'Wassermelder', alias: 'Wassermelder Badewanne', kind: 'leak', state: 'dry', zigbee: true, battery: 93, lqi: 105},
        {id: 'Bewegung', alias: 'Bewegungsmelder Bad', kind: 'motion', state: 'nomotion', zigbee: true, battery: 79, lqi: 116},
      ],
    },
    {
      room: 'Flur',
      short: 'Flur',
      baseTemp: 19.8,
      lights: [
        {id: 'EG_Decke', alias: 'Flur EG Deckenlicht', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Hue Fair'},
        {id: 'OG_Decke', alias: 'Flur OG Deckenlicht', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Hue Fair'},
        {id: 'Treppe', alias: 'Treppenstufen LED', on: true, pct: 25, zigbee: true, dimmable: true, model: 'Gledopto ZigBee Controller'},
        {id: 'Garderobe', alias: 'Garderobe Spot', on: false, pct: 0, zigbee: true, dimmable: true, model: 'IKEA GU10 ZigBee'},
        {id: 'Eingang', alias: 'Haustür Innenlicht', on: false, pct: 0, zigbee: true, dimmable: false, model: 'Shelly Plus 1'},
      ],
      shutters: [
        {id: 'Treppenhaus', alias: 'Rollladen Treppenhaus', pct: 100},
      ],
      thermostats: [
        {id: 'Heizung', alias: 'Heizkörper Flur', desired: 19.5, measured: 19.8, valve: 10, zigbee: true},
      ],
      plugs: [
        {id: 'Tablet', alias: 'Wand-Tablet Ladegerät', on: true, power: 6.4, zigbee: true},
        {id: 'Repeater', alias: 'ZigBee Router Flur OG', on: true, power: 1.2, zigbee: true},
      ],
      sensors: [
        {id: 'Haustuer', alias: 'Haustür Kontakt', kind: 'contact', state: 'closed', zigbee: true, battery: 88, lqi: 166},
        {id: 'Bewegung_EG', alias: 'Bewegungsmelder Flur EG', kind: 'motion', state: 'nomotion', zigbee: true, battery: 85, lqi: 171},
        {id: 'Bewegung_OG', alias: 'Bewegungsmelder Flur OG', kind: 'motion', state: 'nomotion', zigbee: true, battery: 78, lqi: 158},
        {id: 'Klima', alias: 'Temperatur Flur', kind: 'climate', state: 'T: 19.8 H: 49%', zigbee: true, battery: 90, lqi: 162, extra: {temperature: '19.8', humidity: '49'}},
        {id: 'Rauchmelder_EG', alias: 'Rauchmelder Flur EG', kind: 'smoke', state: 'ok', zigbee: true, battery: 97, lqi: 169},
        {id: 'Rauchmelder_OG', alias: 'Rauchmelder Flur OG', kind: 'smoke', state: 'ok', zigbee: true, battery: 95, lqi: 161},
      ],
    },
    {
      room: 'Kinderzimmer',
      short: 'KZ',
      baseTemp: 20.5,
      lights: [
        {id: 'Decke', alias: 'Deckenlampe Kinderzimmer', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Hue White & Color'},
        {id: 'Schreibtisch', alias: 'Schreibtischlampe', on: false, pct: 0, zigbee: true, dimmable: true, model: 'IKEA TRÅDFRI E27'},
        {id: 'Nachtlicht', alias: 'Sternenhimmel Nachtlicht', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Hue Iris'},
        {id: 'Bett', alias: 'Leselampe Hochbett', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Innr E14 ZigBee'},
      ],
      shutters: [
        {id: 'Fenster', alias: 'Rollladen Kinderzimmer', pct: 90},
      ],
      thermostats: [
        {id: 'Heizung', alias: 'Heizkörper Kinderzimmer', desired: 20.5, measured: 20.5, valve: 20, zigbee: true},
      ],
      plugs: [
        {id: 'Audio', alias: 'Hörspiel-Box Netzteil', on: false, power: 0, zigbee: true},
      ],
      sensors: [
        {id: 'Klima', alias: 'Raumklima Kinderzimmer', kind: 'climate', state: 'T: 20.5 H: 50%', zigbee: true, battery: 82, lqi: 124, extra: {temperature: '20.5', humidity: '50'}},
        {id: 'Fenster', alias: 'Fenster Kinderzimmer', kind: 'contact', state: 'closed', zigbee: true, battery: 86, lqi: 121},
        {id: 'Rauchmelder', alias: 'Rauchmelder Kinderzimmer', kind: 'smoke', state: 'ok', zigbee: true, battery: 92, lqi: 128},
      ],
    },
    {
      room: 'Garten',
      short: 'Garten',
      baseTemp: 8.6,
      lights: [
        {id: 'Terrasse', alias: 'Terrassen-Wandleuchten', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Hue Appear Outdoor'},
        {id: 'Weg_1', alias: 'Gartenweg Poller 1', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Hue Calla'},
        {id: 'Weg_2', alias: 'Gartenweg Poller 2', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Hue Calla'},
        {id: 'Einfahrt', alias: 'Einfahrt Strahler', on: false, pct: 0, zigbee: false, dimmable: false, model: 'Shelly Plus 1PM'},
        {id: 'Carport', alias: 'Carport Beleuchtung', on: false, pct: 0, zigbee: true, dimmable: true, model: 'Hue Econic'},
        {id: 'Schuppen', alias: 'Gartenhaus Licht', on: false, pct: 0, zigbee: true, dimmable: false, model: 'Sonoff ZBMINI'},
      ],
      shutters: [],
      thermostats: [],
      plugs: [
        {id: 'Pumpe', alias: 'Gartenpumpe Zisterne', on: false, power: 0, zigbee: false},
        {id: 'Teich', alias: 'Teichfilter & UV', on: true, power: 34.0, zigbee: false},
        {id: 'Maehroboter', alias: 'Mähroboter Ladestation', on: true, power: 5.2, zigbee: false},
        {id: 'Bewaesserung', alias: 'Ventil Rasenbewässerung', on: false, power: 0, zigbee: true},
      ],
      sensors: [
        {id: 'Bewegung_Einfahrt', alias: 'Bewegungsmelder Einfahrt', kind: 'motion', state: 'nomotion', zigbee: true, battery: 67, lqi: 84, extra: {illuminance: '420'}},
        {id: 'Bewegung_Terrasse', alias: 'Bewegungsmelder Terrasse', kind: 'motion', state: 'nomotion', zigbee: true, battery: 73, lqi: 96, extra: {illuminance: '390'}},
        {id: 'Briefkasten', alias: 'Briefkasten Klappe', kind: 'contact', state: 'closed', zigbee: true, battery: 18, lqi: 72},
        {id: 'Bodenfeuchte', alias: 'Bodenfeuchte Hochbeet', kind: 'climate', state: 'T: 8.1 H: 68%', zigbee: true, battery: 61, lqi: 68, extra: {temperature: '8.1', humidity: '68'}},
        {id: 'Regen', alias: 'Regensensor Dach', kind: 'leak', state: 'dry', zigbee: false, battery: 89, lqi: 92},
      ],
    },
    {
      room: 'Keller',
      short: 'Keller',
      baseTemp: 15.2,
      lights: [
        {id: 'Werkstatt', alias: 'Werkstatt LED-Röhren', on: false, pct: 0, zigbee: false, dimmable: false, model: 'Shelly 1PM'},
        {id: 'Waschkueche', alias: 'Waschküche Licht', on: false, pct: 0, zigbee: true, dimmable: false, model: 'Sonoff ZBMINI'},
        {id: 'Vorratsraum', alias: 'Vorratsraum Licht', on: false, pct: 0, zigbee: true, dimmable: false, model: 'IKEA TRÅDFRI E27'},
        {id: 'Flur', alias: 'Kellerflur Licht', on: false, pct: 0, zigbee: true, dimmable: false, model: 'Hue White'},
      ],
      shutters: [],
      thermostats: [
        {id: 'Werkstatt', alias: 'Heizung Werkstatt', desired: 16.0, measured: 15.2, valve: 12, zigbee: true},
      ],
      plugs: [
        {id: 'Waschmaschine', alias: 'Waschmaschine Energie', on: true, power: 1.8, zigbee: false},
        {id: 'Trockner', alias: 'Wärmepumpentrockner', on: false, power: 0, zigbee: false},
        {id: 'Gefrierschrank', alias: 'Gefrierschrank Keller', on: true, power: 38.5, zigbee: false},
        {id: 'Entfeuchter', alias: 'Luftentfeuchter Keller', on: false, power: 0, zigbee: true},
      ],
      sensors: [
        {id: 'Klima_Wasch', alias: 'Feuchtesensor Waschküche', kind: 'climate', state: 'T: 15.8 H: 58%', zigbee: true, battery: 80, lqi: 98, extra: {temperature: '15.8', humidity: '58'}},
        {id: 'Klima_Vorrat', alias: 'Temperatur Vorratsraum', kind: 'climate', state: 'T: 14.4 H: 55%', zigbee: true, battery: 85, lqi: 94, extra: {temperature: '14.4', humidity: '55'}},
        {id: 'Wassermelder_WM', alias: 'Wassermelder Waschmaschine', kind: 'leak', state: 'dry', zigbee: true, battery: 91, lqi: 102},
        {id: 'Kellertuer', alias: 'Kelleraußentür Kontakt', kind: 'contact', state: 'closed', zigbee: true, battery: 76, lqi: 91},
        {id: 'Kellerfenster', alias: 'Kellerfenster Lichtschacht', kind: 'contact', state: 'closed', zigbee: true, battery: 71, lqi: 88},
        {id: 'Bewegung', alias: 'Bewegungsmelder Keller', kind: 'motion', state: 'nomotion', zigbee: true, battery: 83, lqi: 105},
      ],
    },
    {
      room: 'Technik',
      short: 'Technik',
      baseTemp: 23.1,
      lights: [
        {id: 'HWR', alias: 'Technikraum Licht', on: false, pct: 0, zigbee: false, dimmable: false, model: 'Shelly Plus 1'},
      ],
      shutters: [],
      thermostats: [],
      plugs: [
        {id: 'Switch_PoE', alias: 'Core-Switch PoE', on: true, power: 41.2, zigbee: false},
        {id: 'FritzBox', alias: 'FRITZ!Box Router', on: true, power: 11.4, zigbee: false},
        {id: 'USV', alias: 'USV Netzteil', on: true, power: 92.0, zigbee: false},
        {id: 'Wallbox', alias: 'Wallbox Garage', on: false, power: 0, zigbee: false},
      ],
      sensors: [
        {id: 'Stromzaehler', alias: 'Smart Meter Hauptzähler', kind: 'climate', state: '642 W', zigbee: false, battery: 100, lqi: 200, extra: {power: '642', energy: '4812.4', feed_in: '0'}},
        {id: 'PV_Wechselrichter', alias: 'PV Wechselrichter', kind: 'climate', state: '1840 W', zigbee: false, battery: 100, lqi: 200, extra: {power: '1840', daily_yield: '11.4', soc: '78'}},
        {id: 'Heizung_Vorlauf', alias: 'Wärmepumpe Vorlauf', kind: 'climate', state: 'T: 34.2 °C', zigbee: false, battery: 100, lqi: 200, extra: {temperature: '34.2', return_temp: '29.8', cop: '4.3'}},
        {id: 'Klima_Rack', alias: 'Temperatur Serverschrank', kind: 'climate', state: 'T: 26.4 H: 36%', zigbee: true, battery: 88, lqi: 192, extra: {temperature: '26.4', humidity: '36'}},
        {id: 'Wassermelder_HWR', alias: 'Wassermelder Heizungsraum', kind: 'leak', state: 'dry', zigbee: true, battery: 95, lqi: 184},
      ],
    },
  ];

  let counter = 20;
  for (const rc of roomConfigs) {
    for (const l of rc.lights) {
      counter++;
      list.push(
        makeRawDevice({
          name: `${l.zigbee ? 'HUEDevice' : 'Shelly'}_${rc.short}_${l.id}`,
          type: l.zigbee ? 'HUEDevice' : 'Shelly',
          def: l.zigbee ? `${counter} IODev=ZigBee_Bridge` : `192.168.178.${100 + (counter % 90)}`,
          alias: l.alias,
          room: l.zigbee ? `${rc.room},ZigBee` : rc.room,
          state: l.on ? 'on' : 'off',
          model: l.model,
          webCmd: l.dimmable ? 'on:off:pct' : 'on:off:toggle',
          group: 'Beleuchtung',
          possibleSets: l.dimmable ? 'on off toggle pct:slider,0,1,100 ct:slider,2200,100,6500' : 'on off toggle',
          readings: {
            ...(l.dimmable ? {pct: String(l.pct), bri: String(Math.round(l.pct * 2.54))} : {}),
            ...(l.zigbee ? {reachable: '1', linkquality: String(110 + (counter % 75))} : {rssi: '-62'}),
          },
          minutesAgo: (counter % 55) + 1,
        })
      );
    }

    for (const sh of rc.shutters) {
      counter++;
      list.push(
        makeRawDevice({
          name: `HM_Rollladen_${rc.short}_${sh.id}`,
          type: 'HMCCUDEV',
          def: `00111A4992C${counter}`,
          alias: sh.alias,
          room: `${rc.room},Rollläden`,
          state: `pct ${sh.pct}`,
          model: 'HmIP-BROLL',
          webCmd: 'up:stop:down:pct',
          group: 'Beschattung',
          possibleSets: 'up down stop pct:slider,0,5,100',
          readings: {pct: String(sh.pct), level: String(sh.pct), motor: 'stop', rssi: `-${60 + (counter % 18)}`},
          minutesAgo: (counter % 40) + 5,
        })
      );
    }

    for (const trv of rc.thermostats) {
      counter++;
      list.push(
        makeRawDevice({
          name: `ZB_Thermostat_${rc.short}_${trv.id}`,
          type: 'MQTT2_DEVICE',
          def: `zigbee_trv_${rc.short.toLowerCase()}_${trv.id.toLowerCase()}`,
          alias: trv.alias,
          room: `${rc.room},Klima,ZigBee`,
          state: `T: ${trv.measured.toFixed(1)} desired: ${trv.desired.toFixed(1)} valve: ${trv.valve}%`,
          model: 'Bosch BTH-RA ZigBee TRV',
          webCmd: 'desired-temp:auto:manual:boost',
          group: 'Heizung',
          possibleSets: 'desired-temp:slider,12,0.5,28 auto manual boost',
          readings: {
            temperature: trv.measured.toFixed(1),
            'measured-temp': trv.measured.toFixed(1),
            'desired-temp': trv.desired.toFixed(1),
            valve: String(trv.valve),
            controlMode: 'auto',
            batteryPercent: String(65 + (counter % 30)),
            linkquality: String(105 + (counter % 65)),
          },
          minutesAgo: (counter % 12) + 1,
        })
      );
    }

    for (const pl of rc.plugs) {
      counter++;
      list.push(
        makeRawDevice({
          name: `${pl.zigbee ? 'ZB_Plug' : 'Shelly_Plug'}_${rc.short}_${pl.id}`,
          type: pl.zigbee ? 'MQTT2_DEVICE' : 'Shelly',
          def: pl.zigbee ? `zigbee_plug_${rc.short.toLowerCase()}_${pl.id.toLowerCase()}` : `192.168.178.${150 + (counter % 80)}`,
          alias: pl.alias,
          room: pl.zigbee ? `${rc.room},ZigBee` : rc.room,
          state: pl.on ? 'on' : 'off',
          model: pl.zigbee ? 'Aqara SP-EUC01' : 'Shelly Plus Plug S',
          webCmd: 'on:off:toggle',
          group: 'Steckdosen',
          possibleSets: 'on off toggle',
          readings: {
            power: pl.power.toFixed(1),
            energy: (18.4 + counter * 2.1).toFixed(1),
            voltage: '231',
            ...(pl.zigbee ? {linkquality: String(115 + (counter % 68))} : {rssi: '-59'}),
          },
          minutesAgo: (counter % 20) + 1,
        })
      );
    }

    for (const sen of rc.sensors) {
      counter++;
      const readings: Record<string, string> = {
        ...(sen.extra || {}),
        ...(sen.kind === 'contact' ? {contact: sen.state} : {}),
        ...(sen.kind === 'motion' ? {motion: sen.state} : {}),
        ...(sen.kind === 'smoke' ? {smoke: sen.state} : {}),
        ...(sen.kind === 'leak' ? {water_leak: sen.state} : {}),
        batteryPercent: String(sen.battery),
        ...(sen.battery < 20 ? {battery: 'low'} : {battery: 'ok'}),
        ...(sen.zigbee ? {linkquality: String(sen.lqi)} : {}),
      };
      list.push(
        makeRawDevice({
          name: `${sen.zigbee ? 'ZB' : 'SYS'}_${sen.kind.toUpperCase()}_${rc.short}_${sen.id}`,
          type: sen.zigbee ? 'MQTT2_DEVICE' : 'HTTPMOD',
          def: sen.zigbee ? `zigbee_${sen.kind}_${rc.short.toLowerCase()}_${sen.id.toLowerCase()}` : `local_${sen.id.toLowerCase()}`,
          alias: sen.alias,
          room: sen.zigbee ? `${rc.room},Sensoren,ZigBee` : `${rc.room},Sensoren`,
          state: sen.state,
          model: sen.zigbee
            ? sen.kind === 'contact'
              ? 'Aqara MCCGQ11LM'
              : sen.kind === 'motion'
                ? 'Hue Motion SML003'
                : sen.kind === 'smoke'
                  ? 'Heiman HS1SA-Z'
                  : sen.kind === 'leak'
                    ? 'Aqara SJCGQ11LM'
                    : 'Aqara WSDCGQ11LM'
            : 'FHEM Local Sensor',
          group: sen.kind === 'contact' ? 'Fenster & Türen' : sen.kind === 'climate' || sen.kind === 'co2' ? 'Klima' : 'Sicherheit',
          possibleSets: 'getConfig',
          readings,
          minutesAgo: (counter % 35) + 1,
        })
      );
    }
  }

  // 3. Additional ZigBee Wall Switches / Remotes / Buttons to hit ~200 devices (>105 ZigBee)
  const zigbeeRemotes = [
    {room: 'Wohnzimmer', id: 'Taster_Sofa', alias: 'Wandschalter Sofa 4-fach', model: 'Hue Tap Dial'},
    {room: 'Wohnzimmer', id: 'Taster_Eingang', alias: 'Dimmschalter Wohnzimmer', model: 'Hue Dimmer V2'},
    {room: 'Küche', id: 'Taster_Kueche', alias: 'Dimmschalter Küche', model: 'IKEA RODRET'},
    {room: 'Schlafzimmer', id: 'Taster_Bett_L', alias: 'Funkschalter Bett Links', model: 'Aqara WXKG11LM'},
    {room: 'Schlafzimmer', id: 'Taster_Bett_R', alias: 'Funkschalter Bett Rechts', model: 'Aqara WXKG11LM'},
    {room: 'Büro', id: 'Taster_Desk', alias: 'Szenenschalter Schreibtisch', model: 'Aqara Opple 6-fach'},
    {room: 'Flur', id: 'Taster_Haustuer', alias: 'Alles-Aus Taster Haustür', model: 'Hue Wall Switch'},
    {room: 'Flur', id: 'Taster_OG', alias: 'Wandschalter Flur OG', model: 'Aqara H1 Wireless'},
    {room: 'Bad', id: 'Taster_Bad', alias: 'Funkschalter Badezimmer', model: 'IKEA STYRBAR'},
    {room: 'Kinderzimmer', id: 'Taster_KZ', alias: 'Dimmschalter Kinderzimmer', model: 'Hue Dimmer V2'},
    {room: 'Garten', id: 'Taster_Terrasse', alias: 'Außentaster Terrasse', model: 'Friends of Hue'},
    {room: 'Keller', id: 'Taster_Werkstatt', alias: 'Taster Werkstatt', model: 'Sonoff SNZB-01P'},
    {room: 'Wohnzimmer', id: 'Repeater_WZ', alias: 'ZigBee Signal-Repeater EG', model: 'IKEA TRÅDFRI Repeater'},
    {room: 'Schlafzimmer', id: 'Repeater_SZ', alias: 'ZigBee Signal-Repeater OG', model: 'IKEA TRÅDFRI Repeater'},
    {room: 'Keller', id: 'Repeater_Keller', alias: 'ZigBee Signal-Repeater UG', model: 'Sonoff ZBDongle-E Router'},
    {room: 'Garten', id: 'Repeater_Carport', alias: 'ZigBee Router Carport', model: 'Tuya USB Repeater'},
  ];

  zigbeeRemotes.forEach((rem, idx) => {
    list.push(
      makeRawDevice({
        name: `ZB_${rem.id}`,
        type: 'MQTT2_DEVICE',
        def: `zigbee_${rem.id.toLowerCase()}`,
        alias: rem.alias,
        room: `${rem.room},ZigBee`,
        state: rem.id.startsWith('Repeater') ? 'online' : 'single',
        model: rem.model,
        group: rem.id.startsWith('Repeater') ? 'ZigBee Mesh' : 'Taster & Fernbedienungen',
        possibleSets: 'identify',
        readings: {
          action: rem.id.startsWith('Repeater') ? 'routing' : 'single_press',
          ...(rem.id.startsWith('Repeater') ? {} : {batteryPercent: String(74 + (idx % 24))}),
          linkquality: String(122 + (idx % 68)),
        },
        minutesAgo: 18 + idx * 4,
      })
    );
  });

  // 4. Scenes (LightScene / structure)
  const scenes: FhemRawDevice[] = [
    makeRawDevice({
      name: 'Szene_Wohnzimmer',
      type: 'LightScene',
      def: 'HUEDevice_WZ_Decke HUEDevice_WZ_Stehlampe HUEDevice_WZ_TV_Strip HUEDevice_WZ_Esstisch',
      alias: 'Lichtszene Wohnzimmer',
      room: 'Wohnzimmer,Szenen',
      state: 'Abendgemütlich',
      webCmd: 'scene:Taghell:Abendgemütlich:Kinoabend:AllesAus',
      group: 'Szenen',
      possibleSets: 'scene:Taghell,Abendgemütlich,Kinoabend,AllesAus save',
      readings: {state: 'Abendgemütlich', lastScene: 'Taghell'},
      minutesAgo: 12,
    }),
    makeRawDevice({
      name: 'Struktur_AlleLichter',
      type: 'structure',
      def: 'room_lights HUEDevice_WZ_Decke HUEDevice_WZ_Stehlampe HUEDevice_Kueche_Arbeitsplatte HUEDevice_Buero_Decke',
      alias: 'Alle Lichter im Haus',
      room: 'Szenen,Technik',
      state: 'on',
      webCmd: 'on:off',
      group: 'Szenen',
      possibleSets: 'on off',
      readings: {state: 'on', LastDevice: 'HUEDevice_WZ_Decke'},
      minutesAgo: 2,
    }),
    makeRawDevice({
      name: 'Szene_Hausmodus',
      type: 'dummy',
      def: '',
      alias: 'Hausmodus',
      room: 'Szenen,Technik',
      state: 'Anwesend',
      webCmd: 'Anwesend:Nachtmodus:Abwesend:Urlaub',
      group: 'Szenen',
      possibleSets: 'Anwesend Nachtmodus Abwesend Urlaub',
      readings: {state: 'Anwesend', previous: 'Nachtmodus'},
      minutesAgo: 180,
    }),
  ];
  list.push(...scenes);

  // 5. Automations: at, DOIF, notify, watchdog (for Calendar/Scheduler & Automation Overview)
  const automations: FhemRawDevice[] = [
    makeRawDevice({
      name: 'at_Rolllaeden_Auf_Werktags',
      type: 'at',
      def: '*07:00:00 { fhem("set HM_Rollladen_.* pct 100") if (!$we) }',
      alias: 'Rollläden morgens hoch (Mo–Fr)',
      room: 'Automatisierung,Rollläden',
      state: 'Next: 07:00:00',
      group: 'Zeitpläne (at)',
      webCmd: 'execNow',
      possibleSets: 'execNow active inactive modifyTimeSpec',
      readings: {state: 'Next: 07:00:00', Next: '07:00:00', lastExec: formatFhemTime(360)},
      extraAttrs: {weekdays: '0,1,2,3,4'},
      minutesAgo: 360,
    }),
    makeRawDevice({
      name: 'at_Rolllaeden_Auf_Wochenende',
      type: 'at',
      def: '*08:30:00 { fhem("set HM_Rollladen_.* pct 100") if ($we) }',
      alias: 'Rollläden morgens hoch (Sa–So)',
      room: 'Automatisierung,Rollläden',
      state: 'Next: 08:30:00',
      group: 'Zeitpläne (at)',
      webCmd: 'execNow',
      possibleSets: 'execNow active inactive modifyTimeSpec',
      readings: {state: 'Next: 08:30:00', Next: '08:30:00'},
      extraAttrs: {weekdays: '5,6'},
      minutesAgo: 720,
    }),
    makeRawDevice({
      name: 'at_Kaffeemaschine_Vorheizen',
      type: 'at',
      def: '*06:30:00 set ZB_Plug_Kaffee on',
      alias: 'Espressomaschine vorheizen',
      room: 'Automatisierung,Küche',
      state: 'Next: 06:30:00',
      group: 'Zeitpläne (at)',
      webCmd: 'execNow',
      possibleSets: 'execNow active inactive',
      readings: {state: 'Next: 06:30:00', Next: '06:30:00'},
      extraAttrs: {weekdays: '0,1,2,3,4,5,6'},
      minutesAgo: 390,
    }),
    makeRawDevice({
      name: 'at_Aussenlicht_Sonnenuntergang',
      type: 'at',
      def: '*{sunset("CIVIL",0,"16:30","22:00")} set HUEDevice_Garten_Terrasse pct 60; set HUEDevice_Garten_Weg_.* on',
      alias: 'Außenbeleuchtung bei Sonnenuntergang',
      room: 'Automatisierung,Garten',
      state: 'Next: 17:18:00',
      group: 'Zeitpläne (at)',
      webCmd: 'execNow',
      possibleSets: 'execNow active inactive',
      readings: {state: 'Next: 17:18:00', Next: '17:18:00', solar: 'sunset'},
      extraAttrs: {weekdays: '0,1,2,3,4,5,6'},
      minutesAgo: 120,
    }),
    makeRawDevice({
      name: 'at_Rolllaeden_Zu_Abends',
      type: 'at',
      def: '*{sunset("REAL",900,"17:30","22:30")} set HM_Rollladen_.* pct 0',
      alias: 'Rollläden abends schließen',
      room: 'Automatisierung,Rollläden',
      state: 'Next: 17:45:00',
      group: 'Zeitpläne (at)',
      webCmd: 'execNow',
      possibleSets: 'execNow active inactive',
      readings: {state: 'Next: 17:45:00', Next: '17:45:00', solar: 'sunset'},
      extraAttrs: {weekdays: '0,1,2,3,4,5,6'},
      minutesAgo: 110,
    }),
    makeRawDevice({
      name: 'at_Nachtabsenkung_Heizung',
      type: 'at',
      def: '*22:30:00 set ZB_Thermostat_.* desired-temp 18.0',
      alias: 'Nachtabsenkung Heizung (18°C)',
      room: 'Automatisierung,Klima',
      state: 'Next: 22:30:00',
      group: 'Zeitpläne (at)',
      webCmd: 'execNow',
      possibleSets: 'execNow active inactive',
      readings: {state: 'Next: 22:30:00', Next: '22:30:00'},
      extraAttrs: {weekdays: '0,1,2,3,4,5,6'},
      minutesAgo: 90,
    }),
    makeRawDevice({
      name: 'at_Nachtruhe_Lichter_Aus',
      type: 'at',
      def: '*23:15:00 set HUEDevice_Garten_.* off; set Szene_Hausmodus Nachtmodus',
      alias: 'Nachtruhe & Gartenlicht aus',
      room: 'Automatisierung,Garten',
      state: 'Next: 23:15:00',
      group: 'Zeitpläne (at)',
      webCmd: 'execNow',
      possibleSets: 'execNow active inactive',
      readings: {state: 'Next: 23:15:00', Next: '23:15:00'},
      extraAttrs: {weekdays: '0,1,2,3,4,5,6'},
      minutesAgo: 90,
    }),
    makeRawDevice({
      name: 'at_Backup_FHEM_Sonntag',
      type: 'at',
      def: '*03:15:00 { fhem("backup") if ($wday == 0) }',
      alias: 'Wöchentliches FHEM-Backup',
      room: 'Automatisierung,Technik',
      state: 'Next: 03:15:00',
      group: 'Zeitpläne (at)',
      webCmd: 'execNow',
      possibleSets: 'execNow active inactive',
      readings: {state: 'Next: 03:15:00', Next: '03:15:00'},
      extraAttrs: {weekdays: '6'},
      minutesAgo: 500,
    }),
    makeRawDevice({
      name: 'DOIF_Heizung_Bad_Morgens',
      type: 'DOIF',
      def: '([06:00-08:30|12345] or [07:30-10:00|60]) (set ZB_Thermostat_Bad desired-temp 23.0) DOELSE (set ZB_Thermostat_Bad desired-temp 20.5)',
      alias: 'Bad-Heizung Morgenprogramm',
      room: 'Automatisierung,Bad',
      state: 'cmd_1',
      group: 'DOIF-Regeln',
      webCmd: 'cmd_1:cmd_2:initialize',
      possibleSets: 'cmd_1 cmd_2 initialize disable enable',
      readings: {state: 'cmd_1', cmd_nr: '1', cmd_event: 'timer_01_c01', timer_01_c01: '06:00:00', timer_02_c01: '08:30:00', Next: '06:00:00'},
      minutesAgo: 15,
    }),
    makeRawDevice({
      name: 'DOIF_Fenster_Auf_Heizung_Aus',
      type: 'DOIF',
      def: '([ZB_Fenster_Buero:contact] eq "open") (set ZB_Thermostat_Buero_Heizung desired-temp 12.0) DOELSE (set ZB_Thermostat_Buero_Heizung desired-temp 21.5)',
      alias: 'Fenster-Auf Heizungsabsenkung Büro',
      room: 'Automatisierung,Büro',
      state: 'cmd_1',
      group: 'DOIF-Regeln',
      webCmd: 'cmd_1:cmd_2:initialize',
      possibleSets: 'cmd_1 cmd_2 initialize disable enable',
      readings: {state: 'cmd_1', cmd_nr: '1', cmd_event: 'ZB_Fenster_Buero'},
      minutesAgo: 9,
    }),
    makeRawDevice({
      name: 'DOIF_Beschattung_Sonne',
      type: 'DOIF',
      def: '([12:30-16:30] and [ZB_Sensor_Garten_Klima:temperature] > 25) (set HM_Rollladen_WZ_Links pct 45) DOELSE (set HM_Rollladen_WZ_Links pct 100)',
      alias: 'Sommer-Sonnenschutz Wohnzimmer',
      room: 'Automatisierung,Wohnzimmer',
      state: 'cmd_2',
      group: 'DOIF-Regeln',
      webCmd: 'cmd_1:cmd_2:initialize',
      possibleSets: 'cmd_1 cmd_2 initialize disable enable',
      readings: {state: 'cmd_2', cmd_nr: '2', timer_01_c01: '12:30:00', Next: '12:30:00'},
      extraAttrs: {weekdays: '0,1,2,3,4,5,6'},
      minutesAgo: 45,
    }),
    makeRawDevice({
      name: 'DOIF_Abendlicht_Wohnzimmer',
      type: 'DOIF',
      def: '([18:00-23:00] and [ZB_MOTION_WZ_Bewegung:motion] eq "motion") (set Szene_Wohnzimmer scene Abendgemütlich) DOELSEIF ([23:00]) (set HUEDevice_WZ_Decke off)',
      alias: 'Abendlicht Wohnzimmer Automatik',
      room: 'Automatisierung,Wohnzimmer',
      state: 'cmd_1',
      group: 'DOIF-Regeln',
      webCmd: 'cmd_1:cmd_2:initialize',
      possibleSets: 'cmd_1 cmd_2 initialize disable enable',
      readings: {state: 'cmd_1', cmd_nr: '1', timer_01_c01: '18:00:00', Next: '18:00:00'},
      extraAttrs: {weekdays: '0,1,2,3,4,5,6'},
      minutesAgo: 8,
    }),
    makeRawDevice({
      name: 'DOIF_Bewaesserung_Garten',
      type: 'DOIF',
      def: '([05:45|135] and [SYS_LEAK_Garten_Regen:water_leak] eq "dry") (set ZB_Plug_Garten_Bewaesserung on-for-timer 900)',
      alias: 'Rasenbewässerung (Mo/Mi/Fr)',
      room: 'Automatisierung,Garten',
      state: 'disabled',
      disable: '1',
      group: 'DOIF-Regeln',
      webCmd: 'cmd_1:initialize',
      possibleSets: 'cmd_1 initialize disable enable',
      readings: {state: 'disabled', timer_01_c01: '05:45:00', Next: '05:45:00'},
      extraAttrs: {weekdays: '0,2,4'},
      minutesAgo: 900,
    }),
    makeRawDevice({
      name: 'DOIF_PV_Ueberschuss_Wallbox',
      type: 'DOIF',
      def: '([SYS_CLIMATE_Technik_PV_Wechselrichter:power] > 3500) (set Shelly_Plug_Technik_Wallbox on) DOELSEIF ([SYS_CLIMATE_Technik_PV_Wechselrichter:power] < 1200) (set Shelly_Plug_Technik_Wallbox off)',
      alias: 'PV-Überschussladen Wallbox',
      room: 'Automatisierung,Technik',
      state: 'cmd_2',
      group: 'DOIF-Regeln',
      webCmd: 'cmd_1:cmd_2:initialize',
      possibleSets: 'cmd_1 cmd_2 initialize disable enable',
      readings: {state: 'cmd_2', cmd_nr: '2', cmd_event: 'SYS_CLIMATE_Technik_PV_Wechselrichter'},
      minutesAgo: 22,
    }),
    makeRawDevice({
      name: 'WT_Heizung_Wohnzimmer',
      type: 'WeekdayTimer',
      def: 'ZB_Thermostat_WZ de Mo-Fr|06:15|21.5 Mo-Fr|22:00|18.0 Sa-So|08:00|21.5 Sa-So|23:00|18.0',
      alias: 'Wochenplan Heizung Wohnzimmer',
      room: 'Automatisierung,Wohnzimmer,Klima',
      state: '21.5',
      group: 'WeekdayTimer',
      webCmd: 'enable:disable',
      possibleSets: 'enable disable weekprofile',
      readings: {state: '21.5', currValue: '21.5', nextValue: '18.0', nextUpdate: '22:00:00'},
      minutesAgo: 12,
    }),
    makeRawDevice({
      name: 'notify_Flur_Bewegung',
      type: 'notify',
      def: 'ZB_MOTION_Flur_Bewegung_EG:motion set HUEDevice_Flur_EG_Decke on-for-timer 120',
      alias: 'Flurlicht bei Bewegung (2 Min)',
      room: 'Automatisierung,Flur',
      state: 'active',
      group: 'Notify-Handler',
      webCmd: 'active:inactive',
      possibleSets: 'active inactive',
      readings: {state: 'active', triggeredByDev: 'ZB_MOTION_Flur_Bewegung_EG', triggeredByEvent: 'motion'},
      minutesAgo: 17,
    }),
    makeRawDevice({
      name: 'notify_Taster_Haustuer_AllesAus',
      type: 'notify',
      def: 'ZB_Taster_Haustuer:double set Struktur_AlleLichter off; set Szene_Hausmodus Abwesend',
      alias: 'Doppelklick Haustür: Alle Lichter aus',
      room: 'Automatisierung,Flur',
      state: 'active',
      group: 'Notify-Handler',
      webCmd: 'active:inactive',
      possibleSets: 'active inactive',
      readings: {state: 'active', triggeredByDev: 'ZB_Taster_Haustuer', triggeredByEvent: 'double'},
      minutesAgo: 210,
    }),
    makeRawDevice({
      name: 'notify_Batterie_Warnung',
      type: 'notify',
      def: '.*:battery:.low { Log 2, "Batterie schwach bei $NAME ($EVENT)" }',
      alias: 'ZigBee Batterie-Überwachung',
      room: 'Automatisierung,Technik',
      state: 'active',
      group: 'Notify-Handler',
      webCmd: 'active:inactive',
      possibleSets: 'active inactive',
      readings: {state: 'active', triggeredByDev: 'ZB_Sensor_Garten_Klima', triggeredByEvent: 'battery: low'},
      minutesAgo: 5,
    }),
    makeRawDevice({
      name: 'notify_Wassermelder_Alarm',
      type: 'notify',
      def: '.*Wassermelder.*:wet set HUEDevice_WZ_Decke rgb FF0000; Log 1, "WASSERALARM $NAME"',
      alias: 'Sofort-Alarm bei Wasserleck',
      room: 'Automatisierung,Technik',
      state: 'active',
      group: 'Notify-Handler',
      webCmd: 'active:inactive',
      possibleSets: 'active inactive',
      readings: {state: 'active'},
      minutesAgo: 1440,
    }),
    makeRawDevice({
      name: 'watchdog_Fenster_Buero_30m',
      type: 'watchdog',
      def: 'ZB_Fenster_Buero:open 00:30:00 ZB_Fenster_Buero:closed { Log 3, "Bürofenster seit 30 Min offen" }',
      alias: 'Watchdog Bürofenster > 30 Min',
      room: 'Automatisierung,Büro',
      state: 'triggered',
      group: 'Watchdogs',
      webCmd: 'reset',
      possibleSets: 'reset',
      readings: {state: 'triggered', Triggered: formatFhemTime(2), Activated: formatFhemTime(32)},
      minutesAgo: 2,
    }),
    makeRawDevice({
      name: 'watchdog_ZigBee_Bridge_Health',
      type: 'watchdog',
      def: 'ZigBee_Bridge:offline 00:05:00 ZigBee_Bridge:online set ZigBee_Bridge restart',
      alias: 'Watchdog ZigBee Koordinator',
      room: 'Automatisierung,Technik',
      state: 'defined',
      group: 'Watchdogs',
      webCmd: 'reset',
      possibleSets: 'reset',
      readings: {state: 'defined', lastCheck: formatFhemTime(1)},
      minutesAgo: 1,
    }),
    makeRawDevice({
      name: 'watchdog_Haustuer_Offen',
      type: 'watchdog',
      def: 'ZB_CONTACT_Flur_Haustuer:open 00:05:00 ZB_CONTACT_Flur_Haustuer:closed { Log 2, "Haustür noch offen!" }',
      alias: 'Watchdog Haustür > 5 Min offen',
      room: 'Automatisierung,Flur',
      state: 'defined',
      group: 'Watchdogs',
      webCmd: 'reset',
      possibleSets: 'reset',
      readings: {state: 'defined'},
      minutesAgo: 60,
    }),
  ];

  list.push(...automations);
  return list;
}

export function createInitialEvents(): FhemEventItem[] {
  return [
    {
      id: 'ev-1',
      timestamp: formatFhemTime(0),
      device: 'ZB_Sensor_WZ_Klima',
      deviceType: 'MQTT2_DEVICE',
      event: 'temperature: 21.4 humidity: 48 linkquality: 158',
      level: 'info',
    },
    {
      id: 'ev-2',
      timestamp: formatFhemTime(1),
      device: 'ZB_Plug_ServerRack',
      deviceType: 'MQTT2_DEVICE',
      event: 'power: 84.2 W energy: 612.8 kWh',
      level: 'info',
    },
    {
      id: 'ev-3',
      timestamp: formatFhemTime(2),
      device: 'watchdog_Fenster_Buero_30m',
      deviceType: 'watchdog',
      event: 'triggered (ZB_Fenster_Buero: open > 30m)',
      level: 'warn',
    },
    {
      id: 'ev-4',
      timestamp: formatFhemTime(3),
      device: 'HUEDevice_WZ_Decke',
      deviceType: 'HUEDevice',
      event: 'pct: 78 ct: 2900 state: on',
      level: 'info',
    },
    {
      id: 'ev-5',
      timestamp: formatFhemTime(5),
      device: 'ZB_Sensor_Garten_Klima',
      deviceType: 'MQTT2_DEVICE',
      event: 'battery: low (14%) temperature: 8.6',
      level: 'warn',
    },
    {
      id: 'ev-6',
      timestamp: formatFhemTime(8),
      device: 'DOIF_Fenster_Auf_Heizung_Aus',
      deviceType: 'DOIF',
      event: 'cmd_1 -> set ZB_Thermostat_Buero_Heizung desired-temp 12.0',
      level: 'info',
    },
    {
      id: 'ev-7',
      timestamp: formatFhemTime(14),
      device: 'ZB_Sensor_Garten_Tor',
      deviceType: 'MQTT2_DEVICE',
      event: 'availability: offline (LQI 12, timeout)',
      level: 'error',
    },
  ];
}

export function createInitialLogs(): FhemLogEntry[] {
  return [
    {
      id: 'log-1',
      timestamp: formatFhemTime(180),
      level: 3,
      source: 'FHEM',
      message: 'FHEM 6.4 (2026-10-12) gestartet auf Raspberry Pi 5 — 201 Devices geladen (108 ZigBee).',
    },
    {
      id: 'log-2',
      timestamp: formatFhemTime(179),
      level: 3,
      source: 'FHEMWEB',
      message: 'WEB: HTTP/1.1 Listener aktiv auf Port 8083 (HTTP Basic Auth aktiviert, csrfToken none).',
    },
    {
      id: 'log-3',
      timestamp: formatFhemTime(145),
      level: 1,
      source: 'MQTT2_DEVICE',
      message: 'ZB_Sensor_Garten_Tor: Keine Rückmeldung seit 24h (availability=offline, battery=8%).',
    },
    {
      id: 'log-4',
      timestamp: formatFhemTime(45),
      level: 3,
      source: 'DOIF',
      message: 'DOIF_Beschattung_Sonne: Zustandswechsel zu cmd_2 (Außentemperatur 8.6 °C).',
    },
    {
      id: 'log-5',
      timestamp: formatFhemTime(9),
      level: 3,
      source: 'DOIF',
      message: 'DOIF_Fenster_Auf_Heizung_Aus: Fenster Büro geöffnet -> Sollwert auf 12.0 °C abgesenkt.',
    },
    {
      id: 'log-6',
      timestamp: formatFhemTime(5),
      level: 2,
      source: 'notify_Batterie_Warnung',
      message: 'Batterie schwach bei ZB_Sensor_Garten_Klima (14%, CR2032 wechseln).',
    },
    {
      id: 'log-7',
      timestamp: formatFhemTime(2),
      level: 2,
      source: 'watchdog_Fenster_Buero_30m',
      message: 'Bürofenster seit über 30 Minuten geöffnet.',
    },
  ];
}

export function generateDeviceHistory(
  deviceName: string,
  kind: 'temperature' | 'pct' | 'power' | 'binary',
  currentVal: number
): DeviceHistoryPoint[] {
  // Deterministic pseudo-random seed based on deviceName
  let hash = 0;
  for (let i = 0; i < deviceName.length; i++) {
    hash = (hash * 31 + deviceName.charCodeAt(i)) % 9973;
  }

  const points: DeviceHistoryPoint[] = [];
  const now = Date.now();
  const totalPoints = 24;

  for (let i = totalPoints - 1; i >= 0; i--) {
    const ts = now - i * 3600_000;
    const d = new Date(ts);
    const labelTime = `${String(d.getHours()).padStart(2, '0')}:00`;
    const wave = Math.sin((i + (hash % 12)) * 0.45);
    const noise = (((hash + i * 37) % 100) / 100 - 0.5) * 0.6;

    let value = currentVal;
    if (i > 0) {
      if (kind === 'temperature') {
        value = Number((currentVal + wave * 1.4 + noise).toFixed(1));
      } else if (kind === 'pct') {
        const hour = d.getHours();
        const activeWindow = hour >= 17 || hour <= 8;
        value = activeWindow ? Math.max(0, Math.min(100, Math.round(currentVal + wave * 25))) : 0;
      } else if (kind === 'power') {
        value = Math.max(0, Number((currentVal * (0.65 + (wave + 1) * 0.35) + noise * 8).toFixed(1)));
      } else {
        value = (hash + i) % 5 === 0 ? 1 : 0;
      }
    }

    const label =
      kind === 'temperature'
        ? `${value.toFixed(1)} °C`
        : kind === 'pct'
          ? `${Math.round(value)} %`
          : kind === 'power'
            ? `${value.toFixed(1)} W`
            : value > 0
              ? 'An / Offen'
              : 'Aus / Geschlossen';

    points.push({time: labelTime, timestamp: ts, value, label});
  }

  return points;
}
