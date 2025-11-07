"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWs = createWs;
var ws_1 = require("ws");
function createWs(server, ctx) {
    var wss = new ws_1.WebSocketServer({ server: server });
    wss.on('connection', function (ws) {
        ws.on('message', function (buf) {
            try {
                var cmd = JSON.parse(String(buf));
                ctx.onCommand(cmd);
            }
            catch (_a) { }
        });
    });
    var broadcast = function (ev) {
        var data = JSON.stringify(ev);
        for (var _i = 0, _a = wss.clients; _i < _a.length; _i++) {
            var client = _a[_i];
            try {
                client.send(data);
            }
            catch (_b) { }
        }
    };
    return { broadcast: broadcast };
}
