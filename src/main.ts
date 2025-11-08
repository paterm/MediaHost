import { app, BrowserWindow } from 'electron';
import { createHttp } from './server/http';
import { createWs } from './server/ws';
import { MprisController, NowPlaying } from './mpris/linux';

const PORT = 7777;

app.whenReady().then(async () => {
  const server = createHttp(PORT);

  let lastNP: NowPlaying | null = null;
  let lastStatus: boolean | null = null;
  let lastDur = 0, lastPos = 0;

  const sockets = createWs(server, {
    onCommand: (cmd) => {
      switch (cmd.type) {
        case 'toggle': return mpris.send('toggle');
        case 'play':   return mpris.send('play');
        case 'pause':  return mpris.send('pause');
        case 'next':   return mpris.send('next');
        case 'prev':   return mpris.send('prev');
        case 'seek':   return mpris.send('seek', cmd.ms || 0);
        case 'preferChrome': return mpris.preferChrome();
      }
    },
    // снапшот отдадим пакетом
    getSnapshot: () => ({
      nowPlaying: lastNP,
      status: lastStatus,
      progress: { positionMs: lastPos, durationMs: lastDur }
    })
  });

  const mpris = new MprisController({
    onNowPlaying: (np) => {
      if (!np) return; // не шлём пустоту
      const same = lastNP && JSON.stringify(lastNP) === JSON.stringify(np);
      lastNP = np;
      if (!same) sockets.broadcast({ type: 'nowPlaying', data: lastNP });
    },
    onStatus: (isPlaying) => {
      lastStatus = isPlaying;
      sockets.broadcast({ type: 'status', playing: isPlaying });
    },
    onProgress: (posMs, durMs) => {
      lastPos = posMs; if (durMs) lastDur = durMs;
      sockets.broadcast({ type: 'progress', positionMs: lastPos, durationMs: lastDur });
    }
  });

  await mpris.init();

  const win = new BrowserWindow({ width: 460, height: 560, show: true, webPreferences: { contextIsolation: true, sandbox: true } });
  win.loadURL(`http://localhost:${PORT}/`);
});
