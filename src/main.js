"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var electron_1 = require("electron");
var path_1 = require("path");
var http_js_1 = require("./server/http.js");
var ws_js_1 = require("./server/ws.js");
var linux_js_1 = require("./mpris/linux.js");
var win = null;
var tray = null;
var PORT = Number(process.env.NPH_PORT || 7777);
function createWindow() {
    win = new electron_1.BrowserWindow({
        width: 420, height: 520, show: false, // окно не обязательно
        webPreferences: { preload: path_1.default.join(__dirname, 'preload.js') }
    });
    win.loadFile(path_1.default.join(__dirname, 'renderer/index.html'));
}
electron_1.app.whenReady().then(function () { return __awaiter(void 0, void 0, void 0, function () {
    var server, ws, mpris, menu, Bonjour, bonjour;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                server = (0, http_js_1.createHttp)(PORT);
                ws = (0, ws_js_1.createWs)(server, {
                    onCommand: function (cmd) { return mpris.send(cmd); },
                    broadcast: function () { }
                });
                mpris = new linux_js_1.MprisController({
                    onNowPlaying: function (np) { return ws.broadcast({ type: 'nowPlaying', data: np }); },
                    onPlayers: function (list) { return ws.broadcast({ type: 'players', list: list }); }
                });
                return [4 /*yield*/, mpris.init()];
            case 1:
                _a.sent();
                // Tray
                tray = new electron_1.Tray(electron_1.nativeImage.createEmpty()); // поставь иконку .png
                menu = electron_1.Menu.buildFromTemplate([
                    { label: 'Открыть панель', click: function () { win !== null && win !== void 0 ? win : createWindow(); win === null || win === void 0 ? void 0 : win.show(); } },
                    { type: 'separator' },
                    { label: 'Play/Pause', click: function () { return mpris.send({ type: 'toggle' }); } },
                    { label: 'Next ▶▶', click: function () { return mpris.send({ type: 'next' }); } },
                    { label: 'Prev ◀◀', click: function () { return mpris.send({ type: 'prev' }); } },
                    { type: 'separator' },
                    { label: 'Выход', click: function () { return electron_1.app.quit(); } }
                ]);
                tray.setToolTip('NowPlaying Host');
                tray.setContextMenu(menu);
                // Окно (опционально)
                createWindow();
                return [4 /*yield*/, Promise.resolve().then(function () { return require('bonjour-service'); })];
            case 2:
                Bonjour = (_a.sent()).default;
                bonjour = new Bonjour();
                bonjour.publish({ name: 'nowplaying-host', type: 'http', port: PORT, txt: { kind: 'np-host' } });
                // @ts-ignore
                electron_1.app.on('window-all-closed', function (e) { e.preventDefault(); /* работаем из трея */ });
                return [2 /*return*/];
        }
    });
}); });
