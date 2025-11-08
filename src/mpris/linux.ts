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
  private lastTrackKey: string = '';
  private refreshTimer?: NodeJS.Timeout;
  private owners = new Map<string, string>(); // wellKnown -> unique ":1.xxx"

  constructor(private cbs: Cbs) {}

  async init() {
    const obj  = await this.bus.getProxyObject(DBUS_NAME, DBUS_PATH);
    const dbus = obj.getInterface(DBUS_IFACE) as any;
    const names: string[] = await dbus.ListNames();
    for (const n of names) {
      if (n.startsWith('org.mpris.MediaPlayer2.')) {
        this.attach(n);
      }
    }

    dbus.on('NameOwnerChanged', async (name: string, _old: string, neu: string) => {
      if (!name.startsWith('org.mpris.MediaPlayer2.')) return;
      if (neu) {
        await this.attach(name);
      } else {
        this.owners.delete(name);
      }
    });
  }
// attach: получаем unique и строим match по нему
  private async attach(wellKnown: string) {
    if (this.known.has(wellKnown)) return;
    this.known.add(wellKnown);

    const unique = await this.getOwner(wellKnown);
    if (!unique) return; // игрок ещё не полностью поднялся
    this.owners.set(wellKnown, unique);

    // подписки — обращаем внимание на sender=':1.xxx'
    await this.addMatch(`type='signal',sender='${unique}',interface='org.freedesktop.DBus.Properties',member='PropertiesChanged',path='/org/mpris/MediaPlayer2'`);
    await this.addMatch(`type='signal',sender='${unique}',interface='org.mpris.MediaPlayer2.Player',member='Seeked',path='/org/mpris/MediaPlayer2'`);

    // первичный снимок
    const full = await this.getAllProps(wellKnown, 'org.mpris.MediaPlayer2.Player');
    if (full) this.applySnapshot(wellKnown, full);

    // обработчик сигналов
    this.bus.on('message', (msg) => {
      // фильтруем по unique
      if (msg.path !== '/org/mpris/MediaPlayer2' || msg.sender !== unique) return;

      if (msg.interface === 'org.freedesktop.DBus.Properties' && msg.member === 'PropertiesChanged') {
        const iface = msg.body?.[0];
        if (iface !== 'org.mpris.MediaPlayer2.Player') return;
        const changed = msg.body?.[1] || {};
        this.applyPatch(wellKnown, changed); // передаём wellKnown как ключ игрока
        return;
      }

      if (msg.interface === 'org.mpris.MediaPlayer2.Player' && msg.member === 'Seeked') {
        const v = msg.body?.[0];
        const pos = (v && typeof v.value === 'bigint') ? Number(v.value / 1000n) :
          (typeof v === 'bigint' ? Number(v / 1000n) : null);
        if (pos != null) {
          this.positionMs = pos;
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
    this.current ??= name;
    this.lastMeta = props ? { ...props } : {};
    this.applyCommon(props);
    // эмитим только если есть заголовок
    if (hasTitle(this.lastMeta)) {
      this.lastTrackKey = trackKey(this.lastMeta as any);
      this.emitNowPlaying(name);
    }
    // this.emitNowPlaying(name);
    this.updatePolling(); // включить/выключить опрос позиции
  }

  private applyPatch(name: string, patch: Record<string, Variant>) {
    // обновляем кэш
    this.lastMeta = { ...this.lastMeta, ...(patch || {}) };
    this.applyCommon(patch);

    // если пришёл статус/мета — подождём 120 мс и доберём полный снимок
    if (patch.Metadata || patch.PlaybackStatus || patch['xesam:title']) {
      this.scheduleRefresh(name);
    }

    // если уже есть заголовок — можно эмитить сразу (без спама null)
    if (hasTitle(this.lastMeta)) {
      const key = trackKey(this.lastMeta as any);
      if (key !== this.lastTrackKey) {
        this.lastTrackKey = key;
        this.emitNowPlaying(name);
      } else if (patch.Metadata || patch['xesam:title']) {
        // обновили ту же композицию (например, подтянулась обложка) — тоже эмитим
        this.emitNowPlaying(name);
      }
    }
  }

  private scheduleRefresh(name: string) {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(async () => {
      const full = await this.getAllProps(name, PLAYER_IFACE);
      if (full) {
        this.lastMeta = { ...this.lastMeta, ...full };
        this.applyCommon(full);
        if (hasTitle(this.lastMeta)) {
          const key = trackKey(this.lastMeta as any);
          if (key !== this.lastTrackKey) this.lastTrackKey = key;
          this.emitNowPlaying(name);
        }
      }
    }, 120); // 100–200 мс обычно хватает Chromium
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

  private emitNowPlaying(name: string) {
    // здесь НЕ проверяем заново title — сюда уже заходим только когда он есть
    const np = parseNowPlaying(name, this.lastMeta || {});
    if (np) {
      if (!np.durationMs && this.durationMs) np.durationMs = this.durationMs;
      np.isPaused = !this.isPlaying;
      this.cbs.onNowPlaying(np);
    }
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

  private async getOwner(wellKnown: string): Promise<string | null> {
    try {
      const obj = await this.bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus');
      const dbus: any = obj.getInterface('org.freedesktop.DBus');
      return await dbus.GetNameOwner(wellKnown); // ":1.104"
    } catch { return null; }
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

function hasTitle(meta: Record<string, any>): boolean {
  const md = meta?.Metadata?.value as any;
  const t1 = md?.['xesam:title']?.value;
  const t2 = (meta as any)['xesam:title']?.value;
  return !!(t1 || t2);
}

function trackKey(meta: Record<string, any>): string {
  const md = meta?.Metadata?.value as any;
  const t = (md?.['xesam:title']?.value || (meta as any)['xesam:title']?.value || '').toString();
  const aArr = md?.['xesam:artist']?.value || (meta as any)['xesam:artist']?.value;
  const a = Array.isArray(aArr) ? aArr.join(',') : (aArr || '');
  const alb = (md?.['xesam:album']?.value || (meta as any)['xesam:album']?.value || '').toString();
  return `${t} — ${a} — ${alb}`;
}
