import type {AiCommandAction, FhemDevice} from '../types/fhem';

export interface CommandrefEntry {
  id: string;
  title: string;
  category: 'Automatisierung' | 'Basisbefehle' | 'Geräte & Module' | 'Attribute & UI';
  syntax: string;
  summary: string;
  details: string;
  examples: string[];
  keywords: string[];
}

export const FHEM_COMMANDREF: CommandrefEntry[] = [
  {
    id: 'DOIF',
    title: 'DOIF — Bedingte Automatisierung (Zeit & Events)',
    category: 'Automatisierung',
    syntax: 'define <Name> DOIF (<Bedingung1>) (<Befehl1>) DOELSEIF (<Bedingung2>) (<Befehl2>) DOELSE (<Befehl3>)',
    summary:
      'Das universelle FHEM-Automatisierungsmodul für zeit- und ereignisgesteuerte Schaltlogik (inkl. Zeitspannen, Wochentage, Sonnenauf-/untergang, Reading-Vergleiche und Verzögerungen).',
    details: [
      'Zeitpunkt-Trigger: ([20:00]) oder Zeitspanne ([20:00-22:00]).',
      'Wochentage nach Pipe: 0=So, 1=Mo..6=Sa, 7=WE, 8=AT (Werktag), z. B. ([06:30|8]) oder ([20:00-22:00|12345]).',
      'Solarzeiten: ([{sunset("REAL")}]) oder ([{sunrise("CIVIL",0,"06:30","08:30")}]).',
      'Geräte-Readings abfragen: ([Device:Reading] eq "on") oder ([Sensor:temperature] < 20.5). Fragezeichen [?Device:Reading] prüft ohne zu triggern.',
      'Wichtige Attribute: attr <Name> do always (führt Zweig auch bei gleichem Zustand erneut aus), attr <Name> wait 0:300 (Verzögerung je Zweig in Sekunden), attr <Name> room Automatisierung.',
      'Mehrere FHEM-Befehle im Zweig werden mit Komma getrennt: (set Licht1 on, set Licht2 pct 60).',
    ].join('\n'),
    examples: [
      'define DOIF_Licht_Abend DOIF ([20:00]) (set HUEDevice_WZ_Decke on) DOELSEIF ([22:00]) (set HUEDevice_WZ_Decke off)',
      'define DOIF_Licht_Zeitspanne DOIF ([20:00-22:00]) (set HUEDevice_WZ_Decke on) DOELSE (set HUEDevice_WZ_Decke off)',
      'define DOIF_Fenster_Heizung DOIF ([ZB_Fenster_Buero:contact] eq "open") (set ZB_Thermostat_Buero desired-temp 12.0) DOELSE (set ZB_Thermostat_Buero auto)',
      'attr DOIF_Licht_Abend do always',
    ],
    keywords: ['doif', 'zeitspanne', 'uhr', 'doelse', 'doelseif', 'automatik', 'regel', 'bedingung', 'wait', 'do always', 'abends', 'morgens', 'zeitplan'],
  },
  {
    id: 'at',
    title: 'at — Einmalige & wiederkehrende Zeitschaltuhr',
    category: 'Automatisierung',
    syntax: 'define <Name> at [*][+]HH:MM[:SS] <FHEM-Befehl>',
    summary:
      'Führt FHEM-Befehle zu einer festen Uhrzeit, relativ (+00:15:00) oder täglich wiederkehrend (*20:00:00) sowie zu Sonnenauf-/untergang aus.',
    details: [
      'Stern (*) vor der Zeit bedeutet tägliche Wiederholung: *20:00:00.',
      'Plus (+) bedeutet relative Zeit ab jetzt: +00:30:00 (in 30 Minuten).',
      'Solarzeiten mit Perl-Funktion: *{sunset("CIVIL",0,"17:00","22:00")} oder *{sunrise("REAL")}.',
      'Wochentags-Einschränkung im Perl-Block: { fhem("set ...") if (!$we) } (nur werktags) bzw. if ($we) (Wochenende).',
      'Attribute: attr <Name> alignTime 00:00, attr <Name> disable 1 (deaktivieren), set <Name> execNow (sofort testen).',
    ].join('\n'),
    examples: [
      'define at_Licht_20Uhr at *20:00:00 set HUEDevice_WZ_Decke on',
      'define at_Rollladen_Sunset at *{sunset("CIVIL",0,"17:30","22:00")} set HM_Rollladen_WZ_Terrasse pct 0',
      'define at_Kaffee_Werktags at *06:45:00 { fhem("set ZB_Plug_Kaffee on") if (!$we) }',
      'define at_AutoAus_30m at +00:30:00 set HUEDevice_WZ_Decke off',
    ],
    keywords: ['at', 'timer', 'zeitschaltuhr', 'uhrzeit', 'täglich', 'sunset', 'sunrise', 'sonnenuntergang', 'sonnenaufgang', 'werktags', 'in minuten'],
  },
  {
    id: 'notify',
    title: 'notify — Ereignisgesteuerte Aktion',
    category: 'Automatisierung',
    syntax: 'define <Name> notify <RegEx-Suchmuster> <Befehl>',
    summary:
      'Reagiert unmittelbar auf FHEM-Events (z. B. Bewegungsmelder, Taster, Fensterkontakt) und führt FHEM- oder Perl-Befehle aus.',
    details: [
      'Suchmuster formatiert als <Device>:<Event>, z. B. ZB_Bewegung_Flur:motion oder ZB_Fenster_.*:open.',
      'Platzhalter im Befehl: $NAME (auslösendes Gerät), $EVENT (komplettes Event), $EVTPART0 / $EVTPART1 (Teile des Events).',
      'Für effiziente Event-Filterung auf dem Quellgerät empfiehlt sich attr <Quelle> event-on-change-reading .*.',
      'Wichtige Attribute: attr <Name> disabledAfterTrigger 60 (Sperrzeit in Sekunden), attr <Name> disable 1.',
    ].join('\n'),
    examples: [
      'define n_Flur_Motion notify ZB_Bewegung_Flur:motion set HUEDevice_Flur_Decke on-for-timer 180',
      'define n_Fenster_Warnung notify ZB_Fenster_.*:open { Log 3, "Fenster geöffnet: $NAME ($EVENT)" }',
    ],
    keywords: ['notify', 'event', 'bewegung', 'motion', 'taster', 'reagieren', 'auslösen', 'trigger', 'sobald', 'wenn'],
  },
  {
    id: 'watchdog',
    title: 'watchdog — Zeitüberwachung zwischen zwei Events',
    category: 'Automatisierung',
    syntax: 'define <Name> watchdog <RegEx1> <HH:MM:SS> <RegEx2> <Befehl>',
    summary:
      'Löst einen Befehl aus, wenn nach Event 1 innerhalb der Zeitspanne HH:MM:SS das erwartete Event 2 nicht eintritt (ideal für offene Fenster oder fehlende Bewegung).',
    details: [
      'RegEx2 kann SAME sein, wenn dasselbe Event den Timer zurücksetzen soll.',
      'Nach dem Auslösen muss der Watchdog zurückgesetzt werden: set <Name> reset oder attr <Name> autoRestart 1.',
      'attr <Name> regexp1WontReactivate 1 verhindert Neustart durch wiederholte RegEx1-Events.',
    ].join('\n'),
    examples: [
      'define wd_Fenster_Buero watchdog ZB_Fenster_Buero:open 00:20:00 ZB_Fenster_Buero:closed set ZB_Thermostat_Buero desired-temp 14.0',
      'attr wd_Fenster_Buero autoRestart 1',
    ],
    keywords: ['watchdog', 'überwachung', 'offen bleibt', 'nach minuten', 'keine bewegung', 'vergessen', 'autoRestart'],
  },
  {
    id: 'define',
    title: 'define / delete / rename — Geräte anlegen & verwalten',
    category: 'Basisbefehle',
    syntax: 'define <Name> <MODULTYP> [Definition]  |  delete <Name>  |  rename <Alt> <Neu>',
    summary:
      'Erstellt neue FHEM-Geräte, Logikmodule, Dummies, Strukturen oder Szenen im laufenden Server. Danach mit save in fhem.cfg sichern.',
    details: [
      'Gerätenamen dürfen nur Buchstaben, Ziffern, Unterstrich (_) und Punkt (.) enthalten (keine Leerzeichen oder Umlaute).',
      'Typische Modultypen: DOIF, at, notify, watchdog, dummy, structure, LightScene, MQTT2_DEVICE, HUEDevice, FileLog, readingsProxy.',
      'Änderungen per define/attr/delete sind im RAM aktiv und werden erst durch "save" dauerhaft in fhem.cfg geschrieben.',
    ].join('\n'),
    examples: [
      'define Urlaubsmodus dummy',
      'attr Urlaubsmodus setList on off',
      'attr Urlaubsmodus room Szenen',
      'save',
    ],
    keywords: ['define', 'anlegen', 'erstellen', 'neu', 'delete', 'löschen', 'dummy', 'device', 'gerät anlegen'],
  },
  {
    id: 'set_get',
    title: 'set / get / list / jsonlist2 — Steuern & Abfragen',
    category: 'Basisbefehle',
    syntax: 'set <DevSpec> <Befehl> [Wert]  |  get <Device> <Parameter>  |  list [DevSpec]',
    summary:
      'Steuert Aktoren (on, off, toggle, pct, ct, desired-temp, up/down/stop), fragt Werte ab oder listet Gerätedetails.',
    details: [
      'DevSpec erlaubt Einzelgeräte, Kommalisten (Dev1,Dev2), RegEx (HUEDevice_WZ_.*) oder Filter (room=Wohnzimmer:FILTER=TYPE=HUEDevice).',
      'Licht/Dimmer: set <Dev> on | off | toggle | pct <0-100> | ct <2200-6500> | on-for-timer <Sek>.',
      'Rollladen: set <Dev> up | down | stop | pct <0-100> (100=offen, 0=geschlossen).',
      'Thermostat: set <Dev> desired-temp <12.0-28.0> | auto | manual | boost.',
      'Diagnose: list <Dev> zeigt Internals, Readings & Attribute; jsonlist2 <DevSpec> liefert strukturiertes JSON.',
    ].join('\n'),
    examples: [
      'set HUEDevice_WZ_Decke pct 65',
      'set HM_Rollladen_WZ_.* pct 0',
      'set ZB_Thermostat_WZ desired-temp 21.5',
      'list HUEDevice_WZ_Decke',
    ],
    keywords: ['set', 'get', 'list', 'jsonlist2', 'schalten', 'dimmen', 'rollladen', 'thermostat', 'abfragen', 'status', 'devspec', 'filter'],
  },
  {
    id: 'attr',
    title: 'attr / deleteattr / save — Attribute & Konfiguration',
    category: 'Basisbefehle',
    syntax: 'attr <DevSpec> <Attribut> <Wert>  |  deleteattr <DevSpec> <Attribut>  |  save',
    summary:
      'Setzt Metadaten, Räume, Anzeigenamen, Event-Filter, UI-Steuerungen und fhemApp-Optionen an Geräten.',
    details: [
      'Standard-Attribute: alias (Anzeigename), room (Komma-Liste), group (Untergruppe), comment, disable (0/1), webCmd (z. B. on:off:pct).',
      'Performance/Logging: event-on-change-reading .* (reduziert unnötige Events), userReadings (berechnete Readings).',
      'Konfiguration sichern: Nach Änderungen unbedingt "save" ausführen, um fhem.cfg zu aktualisieren.',
    ].join('\n'),
    examples: [
      'attr DOIF_Licht_Abend room Automatisierung,Wohnzimmer',
      'attr DOIF_Licht_Abend alias Abendlicht Automatik',
      'attr ZB_Sensor_WZ_Klima event-on-change-reading temperature,humidity',
      'save',
    ],
    keywords: ['attr', 'attribut', 'deleteattr', 'room', 'alias', 'disable', 'save', 'fhem.cfg', 'event-on-change-reading', 'userreadings'],
  },
  {
    id: 'structure_scene',
    title: 'structure & LightScene — Gruppen & Lichtszenen',
    category: 'Geräte & Module',
    syntax: 'define <Name> structure <Typ> <Dev1> <Dev2> ...  |  define <Name> LightScene <Dev1> <Dev2> ...',
    summary:
      'Fasst mehrere Geräte zu einer logischen Gruppe (structure) zusammen oder speichert komplexe Zustände als benannte Szenen (LightScene).',
    details: [
      'structure schaltet alle Mitglieder gemeinsam (z. B. Struktur_AlleLichter) und berechnet einen Sammelzustand.',
      'LightScene speichert aktuelle Zustände mit "set <Szene> save <Szenenname>" und ruft sie mit "set <Szene> scene <Szenenname>" wieder ab.',
    ].join('\n'),
    examples: [
      'define Struktur_WZ_Lichter structure light HUEDevice_WZ_Decke HUEDevice_WZ_Stehlampe',
      'define Szene_Abend LightScene HUEDevice_WZ_Decke HUEDevice_WZ_Stehlampe HUEDevice_WZ_TV_Strip',
      'set Szene_Abend scene Kinoabend',
    ],
    keywords: ['structure', 'gruppe', 'alle lichter', 'lightscene', 'szene', 'kinoabend'],
  },
  {
    id: 'zigbee_mqtt_hue',
    title: 'HUEDevice & MQTT2_DEVICE — ZigBee & Bridge-Geräte',
    category: 'Geräte & Module',
    syntax: 'define <Name> MQTT2_DEVICE <CID>  |  define <Name> HUEDevice <ID> IODev=<Bridge>',
    summary:
      'Bindet Philips Hue, ZigBee2MQTT, Homematic und MQTT-Geräte inkl. Readings wie pct, ct, temperature, batteryPercent und linkquality ein.',
    details: [
      'ZigBee-Qualitätsmetriken: linkquality (LQI 0-255, gut ab >80), batteryPercent (Warnung <=20%), availability (online/offline).',
      'Bei MQTT2_DEVICE lassen sich über attr <Dev> setList und readingList MQTT-Topics flexibel mappen.',
    ].join('\n'),
    examples: [
      'list TYPE=HUEDevice',
      'list room=ZigBee',
      'set HUEDevice_WZ_Decke ct 2700',
    ],
    keywords: ['zigbee', 'mqtt', 'mqtt2', 'hue', 'huedevice', 'batterie', 'linkquality', 'lqi', 'offline', 'sensor'],
  },
  {
    id: 'appOptions',
    title: 'appOptions (fhemApp) & Dashboard-Kacheln',
    category: 'Attribute & UI',
    syntax: 'attr <Device> appOptions {"template":"light","name":"Wohnzimmer","dashboard":true,"size":"wide"}',
    summary:
      'FHEM-natives JSON-Attribut (inspiriert von fhemApp), mit dem Geräte direkt aus FHEM heraus für das Dashboard markiert, benannt und skaliert werden.',
    details: [
      'Unterstützte JSON-Felder in FHEM Control Desk: template (light|shutter|thermostat|switch|sensor), name (Anzeigename), dashboard (true = Dashboard-Sync), size ("sm" oder "wide" für 2x1 Kacheln), sortby (Zahl), info ({left1, right1}).',
      'Über den Button „appOptions Sync“ im Dashboard werden alle Geräte mit "dashboard":true automatisch angeheftet und deren Kachelgröße übernommen.',
    ].join('\n'),
    examples: [
      'attr HUEDevice_WZ_Decke appOptions {"template":"light","dashboard":true,"size":"wide"}',
      'attr ZB_Thermostat_WZ appOptions {"template":"thermostat","dashboard":true,"size":"wide"}',
    ],
    keywords: ['appoptions', 'fhemapp', 'kachel', 'tile', 'dashboard', 'easytiley', 'wide', 'template'],
  },
  {
    id: 'shutdown',
    title: 'shutdown / version / uptime — Serversteuerung',
    category: 'Basisbefehle',
    syntax: 'save  |  shutdown restart  |  shutdown  |  version  |  uptime',
    summary:
      'Administrative FHEM-Serverbefehle für Sicherung, kontrollierten Neustart und Diagnose.',
    details: [
      'Vor "shutdown restart" immer "save" ausführen, damit neue define/attr-Änderungen erhalten bleiben.',
      '"shutdown" beendet FHEM komplett — nur nutzen, wenn ein Systemdienst (systemd) oder manueller Start verfügbar ist.',
    ].join('\n'),
    examples: ['save', 'shutdown restart', 'version'],
    keywords: ['shutdown', 'restart', 'neustart', 'version', 'uptime', 'speichern'],
  },
];

export function searchCommandref(query: string): CommandrefEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return FHEM_COMMANDREF;
  const tokens = q.split(/\s+/).filter((t) => t.length > 1);

  return FHEM_COMMANDREF.map((entry) => {
    const haystack = `${entry.id} ${entry.title} ${entry.category} ${entry.syntax} ${entry.summary} ${entry.details} ${entry.keywords.join(' ')}`.toLowerCase();
    let score = 0;
    if (entry.id.toLowerCase() === q) score += 20;
    if (entry.title.toLowerCase().includes(q)) score += 10;
    for (const token of tokens) {
      if (entry.keywords.some((k) => k.includes(token) || token.includes(k))) score += 5;
      if (haystack.includes(token)) score += 2;
    }
    return {entry, score};
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.entry);
}

function scoreDeviceRelevance(device: FhemDevice, tokens: string[], rawQuery: string): number {
  const lowerName = device.name.toLowerCase();
  const lowerAlias = device.alias.toLowerCase();
  const lowerRooms = device.rooms.join(' ').toLowerCase();
  const lowerType = device.type.toLowerCase();
  let score = 0;

  if (rawQuery.includes(lowerName)) score += 40;
  if (rawQuery.includes(lowerAlias)) score += 35;

  for (const token of tokens) {
    if (token.length < 2) continue;
    if (lowerName.includes(token)) score += 10;
    if (lowerAlias.includes(token)) score += 10;
    if (lowerRooms.includes(token)) score += 6;
    if (lowerType.includes(token)) score += 5;
    if (
      (token.includes('licht') || token.includes('lampe') || token.includes('decke') || token.includes('dimm')) &&
      device.category === 'light'
    ) {
      score += 4;
    }
    if ((token.includes('roll') || token.includes('jalous') || token.includes('shutter')) && device.isShutter) {
      score += 5;
    }
    if ((token.includes('heiz') || token.includes('thermo') || token.includes('temp')) && (device.isThermostat || device.temperature !== undefined)) {
      score += 4;
    }
    if ((token.includes('fenster') || token.includes('tür') || token.includes('kontakt') || token.includes('offen')) && device.readings.contact) {
      score += 6;
    }
    if ((token.includes('batterie') || token.includes('akku') || token.includes('schwach')) && device.battery !== undefined && device.battery <= 25) {
      score += 8;
    }
    if ((token.includes('fehler') || token.includes('offline') || token.includes('störung')) && device.statusTone === 'error') {
      score += 10;
    }
    if ((token.includes('steckdose') || token.includes('plug') || token.includes('strom') || token.includes('watt') || token.includes('kaffee')) && device.category === 'switch') {
      score += 5;
    }
  }

  return score;
}

export function buildFhemAiSystemPrompt(
  userPrompt: string,
  devices: FhemDevice[],
  includeDeviceContext = true,
  customInstructions = ''
): {systemPrompt: string; matchedCommandref: CommandrefEntry[]} {
  const lowerQuery = userPrompt.toLowerCase();
  const tokens = lowerQuery
    .replace(/[^a-zäöüß0-9_.-]+/gi, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  // Pick top relevant Commandref sections (always keep DOIF + at + set_get as baseline if few matches)
  const matched = searchCommandref(userPrompt);
  const selectedRef = matched.length >= 3 ? matched.slice(0, 5) : [...matched, ...FHEM_COMMANDREF.filter((e) => ['DOIF', 'at', 'notify', 'set_get', 'attr'].includes(e.id) && !matched.some((m) => m.id === e.id))].slice(0, 5);

  const commandrefBlock = selectedRef
    .map(
      (entry) =>
        `### ${entry.title}\nSyntax: ${entry.syntax}\n${entry.details}\nBeispiele:\n${entry.examples.map((ex) => `- ${ex}`).join('\n')}`
    )
    .join('\n\n');

  let deviceContextBlock = 'Gerätekontext vom Nutzer deaktiviert.';
  if (includeDeviceContext && devices.length > 0) {
    const activeLights = devices.filter((d) => d.category === 'light' && d.statusTone === 'active');
    const openContacts = devices.filter((d) => d.readings.contact?.Value === 'open');
    const errors = devices.filter((d) => d.statusTone === 'error');
    const lowBattery = devices.filter((d) => d.battery !== undefined && d.battery <= 20);
    const automations = devices.filter((d) => d.category === 'automation');
    const rooms = Array.from(new Set(devices.map((d) => d.primaryRoom))).sort();

    // Rank top 32 relevant devices for exact FHEM names & possibleSets
    const ranked = devices
      .map((d) => ({d, score: scoreDeviceRelevance(d, tokens, lowerQuery)}))
      .sort((a, b) => b.score - a.score);

    const topDevices = ranked.slice(0, 32).map((r) => r.d);

    const deviceLines = topDevices.map((d) => {
      const extras: string[] = [];
      if (d.pct !== undefined) extras.push(`pct=${d.pct}%`);
      if (d.temperature !== undefined) extras.push(`temp=${d.temperature}°C`);
      if (d.desiredTemp !== undefined) extras.push(`soll=${d.desiredTemp}°C`);
      if (d.humidity !== undefined) extras.push(`rF=${d.humidity}%`);
      if (d.power !== undefined) extras.push(`power=${d.power}W`);
      if (d.battery !== undefined) extras.push(`bat=${d.battery}%`);
      if (d.readings.contact) extras.push(`contact=${d.readings.contact.Value}`);
      const setsPreview = d.possibleSets ? d.possibleSets.split(/\s+/).slice(0, 7).join(',') : '';
      return `- ${d.name} | alias="${d.alias}" | room=${d.primaryRoom} | TYPE=${d.type} | state="${d.state}"${extras.length ? ` | ${extras.join(', ')}` : ''}${setsPreview ? ` | sets=[${setsPreview}]` : ''}`;
    });

    deviceContextBlock = [
      `Live-FHEM-Übersicht (${devices.length} Geräte gesamt, Räume: ${rooms.join(', ')}):`,
      `- Aktive Lichter (${activeLights.length}): ${activeLights.slice(0, 10).map((d) => `${d.name} (${d.alias})`).join(', ') || 'keine'}`,
      `- Offene Fenster/Türen (${openContacts.length}): ${openContacts.map((d) => `${d.name} (${d.alias})`).join(', ') || 'alle geschlossen'}`,
      `- Störungen/Offline (${errors.length}): ${errors.map((d) => `${d.name} (${d.alias}: ${d.state})`).join(', ') || 'keine'}`,
      `- Schwache Batterien <=20% (${lowBattery.length}): ${lowBattery.map((d) => `${d.name} (${d.battery}%)`).join(', ') || 'keine'}`,
      `- Bestehende Automationen (${automations.length}): ${automations.slice(0, 12).map((d) => `${d.name} [${d.type}]`).join(', ')}`,
      '',
      'Relevanteste Live-Geräte (verwende EXAKT diese FHEM-Gerätenamen):',
      ...deviceLines,
    ].join('\n');
  }

  const systemPrompt = [
    'Du bist der integrierte FHEM Smart-Home KI-Assistent im FHEM Control Desk.',
    'Antworte immer präzise, hilfreich und auf Deutsch.',
    'Deine Aufgaben:',
    '1. Fragen zum aktuellen Gerätezustand (Lichter, Fenster, Temperaturen, Batterien, Störungen, Verbrauch) anhand des Live-FHEM-Kontexts direkt beantworten.',
    '2. Korrekte, sofort ausführbare FHEM-Befehle (define DOIF, define at, define notify, define watchdog, attr, set, get, list, save) gemäß offizieller FHEM Commandref erstellen.',
    '3. Verwende bei bekannten Geräten IMMER die exakten FHEM-Gerätenamen aus dem Gerätekontext (z. B. HUEDevice_WZ_Decke statt "Wohnzimmer Lampe"). Falls ein Gerät nicht existiert, weise kurz darauf hin und schlage das ähnlichste vorhandene Gerät vor.',
    '4. Gib ausführbare FHEM-Befehle IMMER einzeln pro Zeile in einem ```fhem Codeblock zurück, damit die App daraus anklickbare „Ausführen“-Schaltflächen bauen kann. Keine Kommentare innerhalb des ```fhem Codeblocks.',
    '5. Bei neuen define-Automationen (DOIF/at/notify/watchdog) ergänze sinnvolle Attribute wie `attr <Name> room Automatisierung` und bei Bedarf `attr <Name> do always` sowie abschließend optional `save`.',
    '',
    '--- FHEM COMMANDREF WISSENSBASIS ---',
    commandrefBlock,
    '',
    '--- LIVE FHEM GERÄTEKONTEXT ---',
    deviceContextBlock,
    customInstructions.trim() ? `\n--- ZUSÄTZLICHE NUTZER-ANWEISUNGEN ---\n${customInstructions.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {systemPrompt, matchedCommandref: selectedRef};
}

export function classifyFhemCommand(cmd: string): Pick<AiCommandAction, 'kind' | 'requiresConfirm' | 'label'> {
  const trimmed = cmd.trim();
  const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase() || '';

  if (firstWord === 'define') {
    const parts = trimmed.split(/\s+/);
    return {
      kind: 'define',
      requiresConfirm: true,
      label: `Device anlegen (${parts[2] || 'define'}: ${parts[1] || ''})`,
    };
  }
  if (firstWord === 'delete') {
    return {kind: 'delete', requiresConfirm: true, label: `Gerät löschen (${trimmed.split(/\s+/)[1] || ''})`};
  }
  if (firstWord === 'shutdown') {
    return {kind: 'other', requiresConfirm: true, label: trimmed.includes('restart') ? 'FHEM neu starten' : 'FHEM herunterfahren'};
  }
  if (firstWord === 'attr' || firstWord === 'deleteattr') {
    return {kind: 'attr', requiresConfirm: false, label: `Attribut setzen (${trimmed.split(/\s+/)[2] || ''})`};
  }
  if (firstWord === 'set') {
    return {kind: 'set', requiresConfirm: false, label: `Steuern (${trimmed.split(/\s+/)[1] || ''})`};
  }
  if (firstWord === 'get') {
    return {kind: 'get', requiresConfirm: false, label: `Wert abfragen (${trimmed.split(/\s+/)[1] || ''})`};
  }
  if (firstWord === 'list' || firstWord === 'jsonlist2') {
    return {kind: 'list', requiresConfirm: false, label: 'Gerät inspizieren'};
  }
  if (firstWord === 'save') {
    return {kind: 'save', requiresConfirm: false, label: 'Konfiguration in fhem.cfg speichern'};
  }
  return {kind: 'other', requiresConfirm: false, label: 'FHEM-Befehl ausführen'};
}

const VALID_CMD_PREFIXES = /^(define|attr|deleteattr|set|get|list|jsonlist2|delete|save|shutdown|trigger|rename|version|uptime)\b/i;

export function extractFhemCommandsFromReply(text: string): AiCommandAction[] {
  const commands: string[] = [];
  const seen = new Set<string>();

  const pushCandidate = (line: string) => {
    const cleaned = line
      .trim()
      .replace(/^[-*•]\s*/, '')
      .replace(/^`\s*|\s*`$/g, '')
      .trim();
    if (!cleaned || cleaned.startsWith('#') || cleaned.startsWith('//')) return;
    if (!VALID_CMD_PREFIXES.test(cleaned)) return;
    if (seen.has(cleaned)) return;
    seen.add(cleaned);
    commands.push(cleaned);
  };

  // 1. Prefer fenced code blocks (```fhem ... ``` or generic ``` ... ```)
  const fenceRegex = /```(?:fhem|perl|bash|sh|text)?\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(text)) !== null) {
    const block = match[1];
    for (const line of block.split('\n')) {
      pushCandidate(line);
    }
  }

  // 2. Fallback: scan standalone lines if no fenced code block contained commands
  if (commands.length === 0) {
    for (const line of text.split('\n')) {
      if (VALID_CMD_PREFIXES.test(line.trim())) {
        pushCandidate(line);
      }
    }
  }

  return commands.map((command, idx) => ({
    id: `cmd-${Date.now()}-${idx}`,
    command,
    ...classifyFhemCommand(command),
  }));
}

// ============================================================================
// Deterministic Local FHEM-Helfer Fallback (works offline & before API key setup)
// ============================================================================

function findBestDeviceFromPrompt(prompt: string, devices: FhemDevice[]): FhemDevice | null {
  const lower = prompt.toLowerCase();
  const tokens = lower
    .replace(/[^a-zäöüß0-9_.-]+/gi, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !['lege', 'mir', 'ein', 'eine', 'doif', 'fuer', 'für', 'das', 'die', 'der', 'und', 'uhr', 'angeht', 'ausgeht', 'wieder', 'aus', 'an', 'erstelle', 'bitte', 'gerät', 'geraet', 'um', 'notify', 'watchdog'].includes(t));

  let best: {d: FhemDevice; score: number} | null = null;
  for (const d of devices) {
    if (d.category === 'automation' || d.category === 'system') continue;
    const score = scoreDeviceRelevance(d, tokens, lower);
    if (score > 0 && (!best || score > best.score)) {
      best = {d, score};
    }
  }
  return best ? best.d : null;
}

function normalizeTimeStr(rawHour: string, rawMin?: string): string {
  const h = String(Math.min(23, Math.max(0, Number(rawHour)))).padStart(2, '0');
  const m = String(Math.min(59, Math.max(0, Number(rawMin || '0')))).padStart(2, '0');
  return `${h}:${m}`;
}

export function runLocalFhemAssistantFallback(
  prompt: string,
  devices: FhemDevice[]
): {content: string; commands: AiCommandAction[]; commandrefTopics: string[]} {
  const lower = prompt.toLowerCase();

  // Extract time patterns like "20 Uhr", "20:00", "22:30 Uhr"
  const timeMatches = Array.from(prompt.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(?:uhr)?\b/gi))
    .filter((m) => {
      const full = m[0].toLowerCase();
      const hasColon = Boolean(m[2]);
      const hasUhr = full.includes('uhr');
      const hour = Number(m[1]);
      return (hasColon || hasUhr) && hour >= 0 && hour <= 23;
    })
    .map((m) => normalizeTimeStr(m[1], m[2]));

  // 1. DOIF creation request
  if (lower.includes('doif') || (timeMatches.length >= 2 && (lower.includes('an') || lower.includes('ein') || lower.includes('aus') || lower.includes('auf') || lower.includes('zu')))) {
    const target = findBestDeviceFromPrompt(prompt, devices) || devices.find((d) => d.name === 'HUEDevice_WZ_Decke') || devices[0];
    const targetName = target?.name || 'Geraet_XY';
    const targetAlias = target?.alias || targetName;
    const startTime = timeMatches[0] || '20:00';
    const endTime = timeMatches[1] || '22:00';
    const isShutter = target?.isShutter || lower.includes('rollladen');
    const onCmd = isShutter ? `set ${targetName} pct 100` : `set ${targetName} on`;
    const offCmd = isShutter ? `set ${targetName} pct 0` : `set ${targetName} off`;

    const safeSuffix = targetName.replace(/[^A-Za-z0-9_]/g, '').slice(0, 22);
    const doifName = `DOIF_${safeSuffix}_${startTime.replace(':', '')}`;

    const cmds = [
      `define ${doifName} DOIF ([${startTime}]) (${onCmd}) DOELSEIF ([${endTime}]) (${offCmd})`,
      `attr ${doifName} room Automatisierung,${target?.primaryRoom || 'Wohnzimmer'}`,
      `attr ${doifName} alias ${targetAlias} (${startTime}–${endTime})`,
      `attr ${doifName} do always`,
      `save`,
    ];

    const content = [
      `Ich habe ein **DOIF** nach FHEM Commandref für **${targetAlias}** (\`${targetName}\`) erstellt:`,
      `- **${startTime} Uhr**: \`${onCmd}\``,
      `- **${endTime} Uhr**: \`${offCmd}\``,
      `- Mit \`attr ${doifName} do always\` wird die Schaltung jeden Tag zuverlässig ausgeführt, auch wenn das Gerät zwischendurch manuell geschaltet wurde.`,
      '',
      '```fhem',
      ...cmds,
      '```',
      '',
      'Du kannst die Befehle unten direkt ausführen (das `define` wird aus Sicherheitsgründen vorher bestätigt) oder oben einen OpenAI-kompatiblen API-Key für freie KI-Dialoge hinterlegen.',
    ].join('\n');

    return {
      content,
      commands: extractFhemCommandsFromReply(content),
      commandrefTopics: ['DOIF', 'attr', 'define'],
    };
  }

  // 2. `at` timer / sunset / sunrise creation
  if (lower.includes(' at ') || lower.startsWith('at ') || lower.includes('sonnenuntergang') || lower.includes('sonnenaufgang') || lower.includes('sunset') || lower.includes('sunrise') || lower.includes('zeitschalt')) {
    const target = findBestDeviceFromPrompt(prompt, devices) || devices.find((d) => d.isShutter) || devices[0];
    const targetName = target?.name || 'HM_Rollladen_WZ_Terrasse';
    const isSunset = lower.includes('sonnenuntergang') || lower.includes('sunset');
    const isSunrise = lower.includes('sonnenaufgang') || lower.includes('sunrise');
    const timeSpec = isSunset
      ? '*{sunset("CIVIL",0,"17:30","22:00")}'
      : isSunrise
        ? '*{sunrise("CIVIL",0,"06:00","08:30")}'
        : `*${timeMatches[0] || '20:00'}:00`;
    const action = target?.isShutter
      ? isSunrise ? 'pct 100' : 'pct 0'
      : lower.includes('aus') ? 'off' : 'on';
    const atName = `at_${targetName.replace(/[^A-Za-z0-9_]/g, '').slice(0, 20)}_${isSunset ? 'Sunset' : isSunrise ? 'Sunrise' : (timeMatches[0] || '2000').replace(':', '')}`;

    const cmds = [
      `define ${atName} at ${timeSpec} set ${targetName} ${action}`,
      `attr ${atName} room Automatisierung,${target?.primaryRoom || 'Wohnzimmer'}`,
      `save`,
    ];

    const content = [
      `Hier ist die passende **at**-Zeitschaltuhr für **${target?.alias || targetName}** (\`${targetName}\`):`,
      '',
      '```fhem',
      ...cmds,
      '```',
    ].join('\n');

    return {
      content,
      commands: extractFhemCommandsFromReply(content),
      commandrefTopics: ['at', 'attr'],
    };
  }

  // 3. `notify` / `watchdog` creation
  if (lower.includes('notify') || lower.includes('watchdog') || lower.includes('bewegung')) {
    const sensor = devices.find((d) => d.readings.contact || d.name.toLowerCase().includes('bewegung') || d.name.toLowerCase().includes('fenster'));
    const actor = devices.find((d) => d.category === 'light' || d.isThermostat);
    const sensorName = sensor?.name || 'ZB_Bewegung_Flur';
    const actorName = actor?.name || 'HUEDevice_WZ_Decke';

    const isWatchdog = lower.includes('watchdog');
    const cmds = isWatchdog
      ? [
          `define wd_${sensorName} watchdog ${sensorName}:open 00:15:00 ${sensorName}:closed set ${actorName} off`,
          `attr wd_${sensorName} autoRestart 1`,
          `attr wd_${sensorName} room Automatisierung`,
        ]
      : [
          `define n_${sensorName} notify ${sensorName}:(motion|open) set ${actorName} on`,
          `attr n_${sensorName} room Automatisierung`,
        ];

    const content = [
      `Entwurf für **${isWatchdog ? 'watchdog' : 'notify'}** gemäß FHEM Commandref:`,
      '',
      '```fhem',
      ...cmds,
      '```',
    ].join('\n');

    return {
      content,
      commands: extractFhemCommandsFromReply(content),
      commandrefTopics: [isWatchdog ? 'watchdog' : 'notify', 'attr'],
    };
  }

  // 4. Live queries: open windows, low battery, errors, lights, temperatures, power
  const openContacts = devices.filter((d) => d.readings.contact?.Value === 'open');
  const lowBat = devices.filter((d) => d.battery !== undefined && d.battery <= 20);
  const errors = devices.filter((d) => d.statusTone === 'error');
  const activeLights = devices.filter((d) => d.category === 'light' && d.statusTone === 'active');
  const temps = devices.filter((d) => d.temperature !== undefined);
  const totalPower = devices.reduce((sum, d) => sum + (d.power && d.category === 'switch' ? d.power : 0), 0);

  if (lower.includes('fenster') || lower.includes('batterie') || lower.includes('fehler') || lower.includes('offline') || lower.includes('störung')) {
    const lines = [
      `**Live-Status aus FHEM (${devices.length} Geräte):**`,
      `- **Offene Fenster/Türen (${openContacts.length}):** ${openContacts.length ? openContacts.map((d) => `${d.alias} (\`${d.name}\`, ${d.primaryRoom})`).join(', ') : 'Alle geschlossen'}`,
      `- **Schwache Batterien ≤20% (${lowBat.length}):** ${lowBat.length ? lowBat.map((d) => `${d.alias} (${d.battery}%)`).join(', ') : 'Alle Batterien OK'}`,
      `- **Störungen/Offline (${errors.length}):** ${errors.length ? errors.map((d) => `${d.alias} (\`${d.name}\`: ${d.state})`).join(', ') : 'Keine Störungen'}`,
    ];
    const inspectCmds = [...openContacts.slice(0, 2), ...errors.slice(0, 2)].map((d) => `list ${d.name}`);
    if (inspectCmds.length) {
      lines.push('', '```fhem', ...inspectCmds, '```');
    }
    const content = lines.join('\n');
    return {content, commands: extractFhemCommandsFromReply(content), commandrefTopics: ['set_get', 'zigbee_mqtt_hue']};
  }

  if (lower.includes('licht') || lower.includes('strom') || lower.includes('watt') || lower.includes('temperatur') || lower.includes('warm') || lower.includes('status')) {
    const avgTemp = temps.length ? (temps.reduce((a, b) => a + (b.temperature || 0), 0) / temps.length).toFixed(1) : '--';
    const lines = [
      `**Aktuelle Haus-Übersicht (${devices.length} Geräte):**`,
      `- **Aktive Lichter (${activeLights.length}):** ${activeLights.slice(0, 8).map((d) => `${d.alias} (${d.pct !== undefined ? `${d.pct}%` : 'An'})`).join(', ') || 'Alle aus'}`,
      `- **Ø Raumtemperatur:** ${avgTemp} °C (${temps.slice(0, 5).map((d) => `${d.primaryRoom}: ${d.temperature?.toFixed(1)} °C`).join(', ')})`,
      `- **Aktuelle Steckdosen-Leistung:** ${totalPower.toFixed(0)} W`,
      '',
      '```fhem',
      'set Struktur_AlleLichter off',
      '```',
    ];
    const content = lines.join('\n');
    return {content, commands: extractFhemCommandsFromReply(content), commandrefTopics: ['set_get', 'structure_scene']};
  }

  // Generic helpful response pointing to both local capabilities & OpenAI setup
  const matched = findBestDeviceFromPrompt(prompt, devices);
  const lines = [
    'Ich bin im **Lokalen FHEM-Helfer-Modus** aktiv (kein externer OpenAI-API-Key konfiguriert).',
    matched
      ? `Gefundenes Gerät: **${matched.alias}** (\`${matched.name}\`, Raum ${matched.primaryRoom}, Status: ${matched.statusLabel}).`
      : 'Ich habe Zugriff auf alle Live-Geräte und die integrierte FHEM Commandref.',
    '',
    'Beispiele, die sofort funktionieren:',
    '- *„Lege mir ein DOIF für Wohnzimmer Decke an, das um 20 Uhr angeht und um 22 Uhr wieder aus“*',
    '- *„Erstelle ein at zum Sonnenuntergang für Rollladen Terrasse“*',
    '- *„Welche Fenster sind offen und welche Batterien sind schwach?“*',
    '',
    'Für komplexe, freie KI-Konversationen kannst du oben im Tab **API-Setup** deine eigene OpenAI-kompatible URL (z. B. OpenAI, OpenRouter, Groq, Ollama oder LM Studio) und deinen API-Key verschlüsselt hinterlegen.',
  ];
  if (matched) {
    lines.push('', '```fhem', `list ${matched.name}`, '```');
  }

  const content = lines.join('\n');
  return {content, commands: extractFhemCommandsFromReply(content), commandrefTopics: ['DOIF', 'at', 'set_get']};
}
