import React, {useEffect, useState} from 'react';
import {PlusCircle, X} from 'lucide-react';

interface DefineDeviceModalProps {
  open: boolean;
  defaultType?: string;
  onClose: () => void;
  onSubmitDefine: (payload: {
    name: string;
    type: string;
    definition: string;
    room: string;
    alias: string;
  }) => void;
}

const TEMPLATES: Array<{label: string; type: string; defPlaceholder: string; defaultDef: string; room: string}> = [
  {
    label: 'MQTT2 / ZigBee',
    type: 'MQTT2_DEVICE',
    defPlaceholder: 'zigbee_lampe_neu',
    defaultDef: 'zigbee_device_neu',
    room: 'Wohnzimmer,ZigBee',
  },
  {
    label: 'HUEDevice',
    type: 'HUEDevice',
    defPlaceholder: '42 IODev=ZigBee_Bridge',
    defaultDef: '42 IODev=ZigBee_Bridge',
    room: 'Wohnzimmer,ZigBee',
  },
  {
    label: 'Zeitplan (at)',
    type: 'at',
    defPlaceholder: '*20:30:00 set HUEDevice_WZ_Decke pct 50',
    defaultDef: '*20:30:00 set HUEDevice_WZ_Decke pct 50',
    room: 'Automatisierung',
  },
  {
    label: 'DOIF-Regel',
    type: 'DOIF',
    defPlaceholder: '([20:00]) (set HUEDevice_WZ_Stehlampe on) DOELSEIF ([22:00]) (set HUEDevice_WZ_Stehlampe off)',
    defaultDef: '([20:00]) (set HUEDevice_WZ_Stehlampe on) DOELSEIF ([22:00]) (set HUEDevice_WZ_Stehlampe off)',
    room: 'Automatisierung',
  },
  {
    label: 'WeekdayTimer',
    type: 'WeekdayTimer',
    defPlaceholder: 'ZB_Thermostat_WZ de Mo-Fr|06:30|21.5 Mo-Fr|22:00|18.0 Sa-So|08:30|21.5',
    defaultDef: 'ZB_Thermostat_WZ de Mo-Fr|06:30|21.5 Mo-Fr|22:00|18.0 Sa-So|08:30|21.5',
    room: 'Automatisierung',
  },
  {
    label: 'Notify',
    type: 'notify',
    defPlaceholder: 'ZB_Fenster_Buero:open set HUEDevice_Buero_Decke on',
    defaultDef: 'ZB_Fenster_Buero:open set HUEDevice_Buero_Decke on',
    room: 'Automatisierung',
  },
  {
    label: 'Watchdog',
    type: 'watchdog',
    defPlaceholder: 'ZB_Fenster_Buero:open 00:15:00 ZB_Fenster_Buero:closed Log 3, "Fenster offen"',
    defaultDef: 'ZB_Fenster_Buero:open 00:15:00 ZB_Fenster_Buero:closed { Log 3, "Fenster offen" }',
    room: 'Automatisierung',
  },
  {
    label: 'Dummy-Schalter',
    type: 'dummy',
    defPlaceholder: '(optional leer lassen)',
    defaultDef: '',
    room: 'Technik',
  },
];

export const DefineDeviceModal: React.FC<DefineDeviceModalProps> = ({
  open,
  defaultType,
  onClose,
  onSubmitDefine,
}) => {
  const initialTemplate = TEMPLATES.find((t) => t.type === defaultType) || TEMPLATES[0];
  const [name, setName] = useState('');
  const [type, setType] = useState(initialTemplate.type);
  const [definition, setDefinition] = useState(initialTemplate.defaultDef);
  const [room, setRoom] = useState(initialTemplate.room);
  const [alias, setAlias] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      const tpl = TEMPLATES.find((t) => t.type === defaultType) || TEMPLATES[0];
      setType(tpl.type);
      setDefinition(tpl.defaultDef);
      setRoom(tpl.room);
      setError('');
    }
  }, [open, defaultType]);

  if (!open) return null;

  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    setType(tpl.type);
    setDefinition(tpl.defaultDef);
    setRoom(tpl.room);
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || !/^[A-Za-z0-9_.-]+$/.test(cleanName)) {
      setError('Der Gerätename darf nur Buchstaben, Zahlen, Unterstriche, Punkte oder Bindestriche enthalten.');
      return;
    }
    if (!type.trim()) {
      setError('Bitte einen gültigen FHEM-Gerätetyp (TYPE) angeben.');
      return;
    }
    setError('');
    onSubmitDefine({
      name: cleanName,
      type: type.trim(),
      definition: definition.trim(),
      room: room.trim(),
      alias: alias.trim(),
    });
    setName('');
    setAlias('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="define-modal-title"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-3xl border theme-surface p-6 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <PlusCircle className="h-5 w-5 theme-text" />
            <h2 id="define-modal-title" className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Neues FHEM-Device definieren
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.08]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Templates */}
        <div className="mt-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Vorlage wählen</div>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.type}
                type="button"
                onClick={() => applyTemplate(tpl)}
                className={`min-h-[38px] rounded-xl px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  type === tpl.type
                    ? 'theme-btn-primary'
                    : 'theme-surface-alt text-slate-700 hover:opacity-85 dark:text-slate-300'
                }`}
              >
                {tpl.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Gerätename (FHEM Name) *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. ZB_Lampe_Flur_Neu"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-mono text-slate-900 focus:border-blue-500 focus:outline-none dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                FHEM-Typ (TYPE) *
              </label>
              <input
                type="text"
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="MQTT2_DEVICE"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-mono text-slate-900 focus:border-blue-500 focus:outline-none dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Definition (DEF)
            </label>
            <textarea
              rows={2}
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              placeholder="z. B. *07:30:00 set HUEDevice_WZ_Decke on"
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-mono text-slate-900 focus:border-blue-500 focus:outline-none dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Anzeigename (attr alias)
              </label>
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="z. B. Flur Wandlampe"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Raum (attr room)
              </label>
              <input
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="Wohnzimmer,ZigBee"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
              />
            </div>
          </div>

          <div className="rounded-2xl theme-surface-alt px-3.5 py-2.5 border theme-border">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Befehlsvorschau</div>
            <code className="mt-0.5 block break-all font-mono text-xs theme-text">
              define {name.trim() || '<Name>'} {type.trim() || '<TYPE>'} {definition.trim()}
            </code>
          </div>

          {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08]"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="min-h-[44px] rounded-xl theme-btn-primary px-5 py-2 text-sm font-semibold transition-colors"
            >
              Weiter zur Bestätigung
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
