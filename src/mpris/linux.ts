// src/mpris/linux.ts
import { sessionBus, Message, Variant } from 'dbus-next';

const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
const PROPS_IFACE  = 'org.freedesktop.DBus.Properties';
const DBUS_NAME    = 'org.freedesktop.DBus';
const DBUS_PATH    = '/org/freedesktop/DBus';
const DBUS_IFACE   = 'org.freedesktop.DBus';
const OBJ_PATH     = '/org/mpris/MediaPlayer2';

export type NowPlaying = {
  player: string;
  title: string;
  artist?: string;
  album?: string;
  artUrl?: string;
  durationMs?: number;
  isPaused: boolean;
};

type Cbs = {
  onNowPlaying: (np: NowPlaying | null) => void;
  onStatus?: (isPlaying: boolean) => void;
  onProgress?: (positionMs: number, durationMs?: number) => void;
};

export class MprisController {
  private bus = sessionBus();
  private known = new Set<string>();
  private current?: string;

  private isPlaying = false;
  private durationMs = 0;
  private positionMs = 0;
  private poll?: NodeJS.Timeout;
  private lastMeta?: Record<string, Variant>;

  constructor(private cbs: Cbs) {}

  async init() {
    const obj  = await this.bus.getProxyObject(DBUS_NAME, DBUS_PATH);
    const dbus = obj.getInterface(DBUS_IFACE) as any;
    const names: string[] = await dbus.ListNames();
    for (const n of names) if (n.startsWith('org.mpris.MediaPlayer2.')) this.attach(n);

    dbus.on('NameOwnerChanged', (name: string, _old: string, neu: string) => {
      if (!name.startsWith('org.mpris.MediaPlayer2.')) return;
      if (neu) this.attach(name);
      else this.known.delete(name);
    });
  }

  private attach(name: string) {
    if (this.known.has(name)) return;
    this.known.add(name);

    // матчимся на PropertiesChanged и Seeked конкретного сервиса
    this.addMatch(`type='signal',sender='${name}',interface='${PROPS_IFACE}',member='PropertiesChanged',path='${OBJ_PATH}'`).catch(()=>{});
    this.addMatch(`type='signal',sender='${name}',interface='${PLAYER_IFACE}',member='Seeked',path='${OBJ_PATH}'`).catch(()=>{});

    // первичный снимок
    this.snapshot(name).then(s => s && this.applySnapshot(name, s));

    // слушаем шину
    this.bus.on('message', (msg) => {
      if (msg.sender !== name) return;

      // PropertiesChanged(org.mpris.MediaPlayer2.Player, a{sv}, as)
      if (msg.type === 4 && msg.interface === PROPS_IFACE && msg.member === 'PropertiesChanged' && msg.path === OBJ_PATH) {
        const iface = msg.body?.[0]; if (iface !== PLAYER_IFACE) return;
        const changed = msg.body?.[1] as Record<string, Variant>;
        this.applyPatch(name, changed);
      }

      // Seeked(x: position μs)
      if (msg.type === 4 && msg.interface === PLAYER_IFACE && msg.member === 'Seeked' && msg.path === OBJ_PATH) {
        const pos = msg.body?.[0];
        if (typeof pos === 'bigint') {
          this.positionMs = Number(pos / 1000n);
          this.cbs.onProgress?.(this.positionMs, this.durationMs || undefined);
        }
      }
    });
  }

  // --- публичные действия ---
  preferChrome() {
    const candidate = [...this.known].find(n => /org\.mpris\.MediaPlayer2\.(chrome|chromium|brave|vivaldi)/.test(n));
    if (candidate) this.current = candidate;
  }

  async send(cmd: 'play'|'pause'|'toggle'|'next'|'prev'|'seek', seekMs?: number) {
    const dest = this.current; if (!dest) return;
    const call = (member: string, signature = '', body: any[] = []) =>
      this.bus.call(new Message({ destination: dest, path: OBJ_PATH, interface: PLAYER_IFACE, member, signature, body })).catch(()=>{});

    switch (cmd) {
      case 'play':   return call('Play');
      case 'pause':  return call('Pause');
      case 'toggle': return call('PlayPause');
      case 'next':   return call('Next');
      case 'prev':   return call('Previous');
      case 'seek':   return call('Seek', 'x', [BigInt((seekMs ?? 0) * 1000)]); // μs
    }
  }

  // --- внутренняя логика ---
  private async snapshot(dest: string): Promise<Record<string, Variant> | null> {
    return this.getAllProps(dest, PLAYER_IFACE);
  }

  private applySnapshot(name: string, props: Record<string, Variant>) {
    this.lastMeta = props;
    this.current ??= name;
    this.applyCommon(props);
    this.emitNowPlaying(name, props);
    this.updatePolling(); // включить/выключить опрос позиции
  }

  private applyPatch(name: string, patch: Record<string, Variant>) {
    this.lastMeta = { ...(this.lastMeta || {}), ...(patch || {}) };
    // дополняем то, что нужно для статусов/позиции
    this.applyCommon(patch);
    // если изменились метаданные/статус — отправим nowPlaying
    this.emitNowPlaying(name, patch);
  }

  private applyCommon(props: Record<string, Variant>) {
    const status = String(props?.PlaybackStatus?.value ?? '').toLowerCase();
    if (status) {
      const playing = (status === 'playing');
      if (playing !== this.isPlaying) {
        this.isPlaying = playing;
        this.cbs.onStatus?.(this.isPlaying);
        this.updatePolling();
      }
    }
    // длительность из Metadata
    const md = props.Metadata?.value as any;
    const length = md?.['mpris:length']?.value ?? props['mpris:length']?.value;
    if (typeof length === 'bigint') this.durationMs = Number(length / 1000n);
    else if (typeof length === 'number') this.durationMs = Math.round(length / 1000);
    // позиция как свойство (не все плееры присылают)
    const pos = props.Position?.value;
    if (typeof pos === 'bigint') {
      this.positionMs = Number(pos / 1000n);
      this.cbs.onProgress?.(this.positionMs, this.durationMs || undefined);
    }
  }

  private emitNowPlaying(name: string, props: Record<string, Variant>) {
    const base = this.lastMeta || props;
    const np = parseNowPlaying(name, base);
    if (np) {
      // прокинем текущие duration/paused, если парсер не увидел
      if (!np.durationMs && this.durationMs) np.durationMs = this.durationMs;
      np.isPaused = !this.isPlaying;
    }
    this.cbs.onNowPlaying(np);
  }

  private updatePolling() {
    if (this.isPlaying) {
      if (!this.poll) {
        this.poll = setInterval(() => this.pollPosition().catch(()=>{}), 500);
      }
    } else if (this.poll) {
      clearInterval(this.poll);
      this.poll = undefined;
    }
  }

  private async pollPosition() {
    const dest = this.current; if (!dest) return;
    const v = await this.getProp(dest, PLAYER_IFACE, 'Position'); // v: Variant(int64 μs)
    if (v && typeof v.value === 'bigint') {
      this.positionMs = Number(v.value / 1000n);
      this.cbs.onProgress?.(this.positionMs, this.durationMs || undefined);
    }
  }

  private async getAllProps(dest: string, iface: string): Promise<Record<string,Variant>|null> {
    try {
      const reply = await this.bus.call(new Message({
        destination: dest, path: OBJ_PATH, interface: PROPS_IFACE, member: 'GetAll',
        signature: 's', body: [iface],
      }));
      return reply.body?.[0] ?? null; // a{sv}
    } catch { return null; }
  }

  private async getProp(dest: string, iface: string, prop: string): Promise<Variant|null> {
    try {
      const reply = await this.bus.call(new Message({
        destination: dest, path: OBJ_PATH, interface: PROPS_IFACE, member: 'Get',
        signature: 'ss', body: [iface, prop],
      }));
      return reply.body?.[0] ?? null; // v
    } catch { return null; }
  }

  private async addMatch(rule: string) {
    await this.bus.call(new Message({
      destination: DBUS_NAME, path: DBUS_PATH, interface: DBUS_IFACE, member: 'AddMatch',
      signature: 's', body: [rule],
    }));
  }
}

export function parseNowPlaying(name: string, props: Record<string, Variant>): NowPlaying | null {
  const mdVar = props.Metadata as Variant | undefined;
  const md    = (mdVar?.value && typeof mdVar.value === 'object') ? (mdVar.value as any) : undefined;
  const getMd = (k: string) => md?.[k]?.value;

  const title = (getMd?.('xesam:title') || (props as any)['xesam:title']?.value || '').toString();
  if (!title) return null;

  const artistVal = getMd?.('xesam:artist') ?? (props as any)['xesam:artist']?.value;
  const artist = Array.isArray(artistVal) ? artistVal.join(', ') : artistVal;

  const album  = getMd?.('xesam:album') ?? (props as any)['xesam:album']?.value;
  const artUrl = getMd?.('mpris:artUrl') ?? (props as any)['mpris:artUrl']?.value;

  const length = getMd?.('mpris:length') ?? (props as any)['mpris:length']?.value; // μs
  const durationMs =
    typeof length === 'bigint' ? Number(length / 1000n) :
      typeof length === 'number' ? Math.round(length / 1000) : undefined;

  const status   = String((props as any).PlaybackStatus?.value ?? '').toLowerCase();
  const isPaused = status ? status !== 'playing' : true;

  return {
    player: name.replace('org.mpris.MediaPlayer2.', ''),
    title, artist: artist || undefined, album: album || undefined,
    artUrl: artUrl || undefined, durationMs, isPaused
  };
}
