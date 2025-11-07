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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MprisController = void 0;
// src/mpris/linux.ts
var dbus_next_1 = require("dbus-next");
var DBUS_NAME = 'org.freedesktop.DBus';
var DBUS_PATH = '/org/freedesktop/DBus';
var DBUS_IFACE = 'org.freedesktop.DBus';
var PROPS_IFACE = 'org.freedesktop.DBus.Properties';
var MPRIS_ROOT = 'org.mpris.MediaPlayer2';
var PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
var OBJ_PATH = '/org/mpris/MediaPlayer2';
var MprisController = /** @class */ (function () {
    function MprisController(h) {
        this.bus = (0, dbus_next_1.sessionBus)(); // MessageBus
        this.players = new Map();
        this.h = h;
    }
    MprisController.prototype.init = function () {
        return __awaiter(this, void 0, void 0, function () {
            var dbusObj, dbus, names, _i, names_1, n;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.bus.getProxyObject(DBUS_NAME, DBUS_PATH)];
                    case 1:
                        dbusObj = _a.sent();
                        dbus = dbusObj.getInterface(DBUS_IFACE);
                        return [4 /*yield*/, dbus.ListNames()];
                    case 2:
                        names = _a.sent();
                        _i = 0, names_1 = names;
                        _a.label = 3;
                    case 3:
                        if (!(_i < names_1.length)) return [3 /*break*/, 6];
                        n = names_1[_i];
                        if (!n.startsWith("".concat(MPRIS_ROOT, "."))) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.attach(n)];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 3];
                    case 6:
                        this.h.onPlayers(__spreadArray([], this.players.keys(), true).map(short));
                        // 3) Слушаем появление/исчезновение имён
                        dbus.on('NameOwnerChanged', function (name, oldOwner, newOwner) { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (!name.startsWith("".concat(MPRIS_ROOT, ".")))
                                            return [2 /*return*/];
                                        if (!newOwner) return [3 /*break*/, 2];
                                        return [4 /*yield*/, this.attach(name)];
                                    case 1:
                                        _a.sent();
                                        return [3 /*break*/, 3];
                                    case 2:
                                        this.players.delete(name);
                                        if (this.current === name) {
                                            this.current = undefined;
                                        }
                                        _a.label = 3;
                                    case 3:
                                        this.h.onPlayers(__spreadArray([], this.players.keys(), true).map(short));
                                        return [2 /*return*/];
                                }
                            });
                        }); });
                        return [2 /*return*/];
                }
            });
        });
    };
    MprisController.prototype.attach = function (name) {
        return __awaiter(this, void 0, void 0, function () {
            var obj, props, player, mdVar_1, stVar_1, e_1;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // уже подключен?
                        if (this.players.has(name))
                            return [2 /*return*/];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, this.bus.getProxyObject(name, OBJ_PATH)];
                    case 2:
                        obj = _a.sent();
                        props = obj.getInterface(PROPS_IFACE);
                        player = obj.getInterface(PLAYER_IFACE);
                        return [4 /*yield*/, props.Get(PLAYER_IFACE, 'Metadata')];
                    case 3:
                        mdVar_1 = _a.sent();
                        return [4 /*yield*/, props.Get(PLAYER_IFACE, 'PlaybackStatus')];
                    case 4:
                        stVar_1 = _a.sent();
                        this.players.set(name, { props: props, player: player });
                        if (!this.current)
                            this.current = name;
                        this.h.onNowPlaying(parseNowPlaying(name, mdVar_1, stVar_1));
                        // подписка на изменения свойств
                        props.on('PropertiesChanged', function (iface, changed) {
                            var _a, _b;
                            if (iface !== PLAYER_IFACE)
                                return;
                            var md = (_a = changed.Metadata) !== null && _a !== void 0 ? _a : mdVar_1;
                            var st = (_b = changed.PlaybackStatus) !== null && _b !== void 0 ? _b : stVar_1;
                            if (md || st)
                                _this.h.onNowPlaying(parseNowPlaying(name, md !== null && md !== void 0 ? md : mdVar_1, st !== null && st !== void 0 ? st : stVar_1));
                        });
                        // прогресс — через сигнал Seeked (int64 в микросекундах)
                        player.on('Seeked', function (posMicros) {
                            var _a, _b;
                            (_b = (_a = _this.h).onProgress) === null || _b === void 0 ? void 0 : _b.call(_a, Number(posMicros) / 1000); // → миллисекунды
                        });
                        return [3 /*break*/, 6];
                    case 5:
                        e_1 = _a.sent();
                        return [3 /*break*/, 6];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    MprisController.prototype.setActive = function (playerShort) {
        if (!playerShort)
            return;
        var full = __spreadArray([], this.players.keys(), true).find(function (n) { return short(n) === playerShort; });
        if (full)
            this.current = full;
    };
    MprisController.prototype.send = function (cmd) {
        return __awaiter(this, void 0, void 0, function () {
            var name, entry, player, props;
            return __generator(this, function (_a) {
                name = this.current;
                if (!name)
                    return [2 /*return*/];
                entry = this.players.get(name);
                if (!entry)
                    return [2 /*return*/];
                player = entry.player, props = entry.props;
                switch (cmd.type) {
                    case 'play': return [2 /*return*/, player.Play()];
                    case 'pause': return [2 /*return*/, player.Pause()];
                    case 'toggle': return [2 /*return*/, player.PlayPause()];
                    case 'next': return [2 /*return*/, player.Next()];
                    case 'prev': return [2 /*return*/, player.Previous()];
                    case 'seek': return [2 /*return*/, player.Seek(BigInt(cmd.ms) * 1000n)]; // → микросекунды
                    case 'setVolume': {
                        // Не все плееры поддерживают громкость через MPRIS
                        try {
                            return [2 /*return*/, props.Set(PLAYER_IFACE, 'Volume', new dbus_next_1.Variant('d', clamp(cmd.level / 100, 0, 1)))];
                        }
                        catch ( /* noop */_b) { /* noop */ }
                    }
                }
                return [2 /*return*/];
            });
        });
    };
    return MprisController;
}());
exports.MprisController = MprisController;
function parseNowPlaying(name, mdVar, stVar) {
    var _a;
    // Metadata: a{sv} — словарь string->Variant
    var md = toPlain(mdVar);
    var title = str(md['xesam:title']);
    if (!title)
        return null;
    var artistArr = arr(md['xesam:artist']);
    var album = str(md['xesam:album']);
    var artUrl = str(md['mpris:artUrl']);
    var lengthMicros = num(md['mpris:length']); // int64 micros
    var durationMs = lengthMicros ? Math.round(lengthMicros / 1000) : undefined;
    var playback = String((_a = stVar === null || stVar === void 0 ? void 0 : stVar.value) !== null && _a !== void 0 ? _a : '').toLowerCase();
    var isPaused = playback !== 'playing';
    // @ts-ignore
    return {
        player: short(name),
        title: title,
        artist: artistArr.join(', ') || undefined,
        album: album || undefined,
        artUrl: artUrl || undefined,
        durationMs: durationMs,
        isPaused: isPaused,
    };
}
// ── helpers ───────────────────────────────────────────────────────────────────
function short(full) { return full.replace("".concat(MPRIS_ROOT, "."), ''); }
function toPlain(v) {
    // mdVar.value может быть Map-like или обычным объектом — нормализуем
    var val = (v && 'value' in v) ? v.value : v;
    if (!val)
        return {};
    if (val instanceof Map) {
        var obj = {};
        for (var _i = 0, _a = val.entries(); _i < _a.length; _i++) {
            var _b = _a[_i], k = _b[0], vv = _b[1];
            obj[k] = vv;
        }
        return obj;
    }
    return val;
}
function val(x) { return (x && 'signature' in x) ? x.value : x; }
function str(x) { var v = val(x); return typeof v === 'string' ? v : ''; }
function num(x) {
    var v = val(x);
    if (typeof v === 'number')
        return v;
    if (typeof v === 'bigint')
        return Number(v);
    return undefined;
}
function arr(x) {
    var v = val(x);
    if (Array.isArray(v))
        return v.map(String);
    if (typeof v === 'string')
        return [v];
    return [];
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
