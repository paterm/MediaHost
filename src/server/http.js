"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHttp = createHttp;
var express_1 = require("express");
var path_1 = require("path");
var url_1 = require("url");
var __dirname = path_1.default.dirname((0, url_1.fileURLToPath)(import.meta.url));
function createHttp(port) {
    var app = (0, express_1.default)();
    // отдадим статику планшету (позже положим PWA сюда)
    app.use('/', express_1.default.static(path_1.default.join(__dirname, '../../static')));
    var server = app.listen(port, function () { return console.log("[HTTP] :".concat(port)); });
    return server;
}
