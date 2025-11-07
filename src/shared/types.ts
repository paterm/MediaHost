export type NowPlaying = {
  player: string;
  title: string;
  artist?: string;
  album?: string;
  artUrl?: string;         // http(s)://, file:// или data:
  durationMs?: number;
  positionMs?: number;
  isPaused: boolean;
};

export type Command =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'seek', ms: number }
  | { type: 'setVolume', level: number }
  | { type: 'preferChrome' };

export type HostEvent =
  | { type: 'nowPlaying'; data: NowPlaying | null }
  | { type: 'progress'; positionMs: number }
  | { type: 'players'; list: string[] };