import { WebSocketServer, WebSocket } from 'ws';

type Ctx = {
  onCommand: (cmd: any) => void;
  getSnapshot?: () => any;          // ← добавим снапшот для новых подключений
};

export function createWs(server: any, ctx: Ctx) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (socket) => {
    console.log('on connection');
    // отдаём текущий снапшот моментально
    if (ctx.getSnapshot) {
      const snap = ctx.getSnapshot();
      if (snap) {
        socket.send(JSON.stringify({ type:'snapshot', ...snap }));
      }
    }

    socket.on('message', async (buf) => {
      let text: string;
      if (typeof buf === 'string') text = buf;
      else if (buf instanceof Buffer) text = buf.toString('utf8');
      else text = String(buf);

      try {
        const cmd = JSON.parse(text);
        ctx.onCommand?.(cmd);
      } catch {
        // игнор
      }
    });
  });

  const broadcast = (ev: any) => {
    const data = typeof ev === 'string' ? ev : JSON.stringify(ev);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        safeSend(client, data);
      }
    }
  };

  return { broadcast };
}

function safeSend(sock: WebSocket, data: string) {
  try { sock.send(data); } catch {}
}
