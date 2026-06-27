"use strict";

const https = require("https");
const http  = require("http");

// ─────────────────────────────────────────────────────────────────
//  Pure-JS MD5  (keine externen Abhängigkeiten nötig)
// ─────────────────────────────────────────────────────────────────
function md5(str) {
    function safeAdd(x, y) {
        const lsw = (x & 0xFFFF) + (y & 0xFFFF);
        return ((x >> 16) + (y >> 16) + (lsw >> 16)) << 16 | (lsw & 0xFFFF);
    }
    function rol(n, c) { return n << c | n >>> (32 - c); }
    function cmn(q, a, b, x, s, t) { return safeAdd(rol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
    const ff = (a,b,c,d,x,s,t) => cmn(b & c | ~b & d, a,b,x,s,t);
    const gg = (a,b,c,d,x,s,t) => cmn(b & d | c & ~d, a,b,x,s,t);
    const hh = (a,b,c,d,x,s,t) => cmn(b ^ c ^ d,      a,b,x,s,t);
    const ii = (a,b,c,d,x,s,t) => cmn(c ^ (b | ~d),   a,b,x,s,t);

    function toBytes(s) {
        const b = [];
        for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            if (c < 128)        b.push(c);
            else if (c < 2048)  b.push(192 | c >> 6, 128 | c & 63);
            else                b.push(224 | c >> 12, 128 | c >> 6 & 63, 128 | c & 63);
        }
        return b;
    }
    function toHex(w) {
        let r = "";
        for (let b = 0; b < 32; b += 8) r += ("0" + ((w[b >> 5] >>> b % 32) & 0xFF).toString(16)).slice(-2);
        return r;
    }

    const raw  = toBytes(str);
    const bits = raw.length * 8;
    const pad  = [...raw, 128];
    while (pad.length % 64 !== 56) pad.push(0);
    pad.push(bits & 0xFF, bits >> 8 & 0xFF, bits >> 16 & 0xFF, bits >> 24 & 0xFF, 0, 0, 0, 0);

    const M = [];
    for (let i = 0; i < pad.length; i += 4)
        M[i >> 2] = pad[i] | pad[i+1] << 8 | pad[i+2] << 16 | pad[i+3] << 24;

    let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
    for (let i = 0; i < M.length; i += 16) {
        const [oa, ob, oc, od] = [a, b, c, d];
        a=ff(a,b,c,d,M[i+0], 7,-680876936); d=ff(d,a,b,c,M[i+1],12,-389564586); c=ff(c,d,a,b,M[i+2],17, 606105819); b=ff(b,c,d,a,M[i+3],22,-1044525330);
        a=ff(a,b,c,d,M[i+4], 7,-176418897); d=ff(d,a,b,c,M[i+5],12,1200080426); c=ff(c,d,a,b,M[i+6],17,-1473231341); b=ff(b,c,d,a,M[i+7],22,-45705983);
        a=ff(a,b,c,d,M[i+8], 7,1770035416); d=ff(d,a,b,c,M[i+9],12,-1958414417); c=ff(c,d,a,b,M[i+10],17,-42063); b=ff(b,c,d,a,M[i+11],22,-1990404162);
        a=ff(a,b,c,d,M[i+12],7,1804603682); d=ff(d,a,b,c,M[i+13],12,-40341101); c=ff(c,d,a,b,M[i+14],17,-1502002290); b=ff(b,c,d,a,M[i+15],22,1236535329);
        a=gg(a,b,c,d,M[i+1], 5,-165796510); d=gg(d,a,b,c,M[i+6], 9,-1069501632); c=gg(c,d,a,b,M[i+11],14, 643717713); b=gg(b,c,d,a,M[i+0],20,-373897302);
        a=gg(a,b,c,d,M[i+5], 5,-701558691); d=gg(d,a,b,c,M[i+10],9,  38016083); c=gg(c,d,a,b,M[i+15],14,-660478335); b=gg(b,c,d,a,M[i+4],20,-405537848);
        a=gg(a,b,c,d,M[i+9], 5, 568446438); d=gg(d,a,b,c,M[i+14],9,-1019803690); c=gg(c,d,a,b,M[i+3],14,-187363961); b=gg(b,c,d,a,M[i+8],20,1163531501);
        a=gg(a,b,c,d,M[i+13],5,-1444681467); d=gg(d,a,b,c,M[i+2], 9,-51403784); c=gg(c,d,a,b,M[i+7],14,1735328473); b=gg(b,c,d,a,M[i+12],20,-1926607734);
        a=hh(a,b,c,d,M[i+5], 4,  -378558); d=hh(d,a,b,c,M[i+8],11,-2022574463); c=hh(c,d,a,b,M[i+11],16,1839030562); b=hh(b,c,d,a,M[i+14],23,-35309556);
        a=hh(a,b,c,d,M[i+1], 4,-1530992060); d=hh(d,a,b,c,M[i+4],11,1272893353); c=hh(c,d,a,b,M[i+7],16,-155497632); b=hh(b,c,d,a,M[i+10],23,-1094730640);
        a=hh(a,b,c,d,M[i+13],4, 681279174); d=hh(d,a,b,c,M[i+0],11,-358537222); c=hh(c,d,a,b,M[i+3],16,-722521979); b=hh(b,c,d,a,M[i+6],23,76029189);
        a=hh(a,b,c,d,M[i+9], 4,-640364487); d=hh(d,a,b,c,M[i+12],11,-421815835); c=hh(c,d,a,b,M[i+15],16,530742520); b=hh(b,c,d,a,M[i+2],23,-995338651);
        a=ii(a,b,c,d,M[i+0], 6,-198630844); d=ii(d,a,b,c,M[i+7],10,1126891415); c=ii(c,d,a,b,M[i+14],15,-1416354905); b=ii(b,c,d,a,M[i+5],21,-57434055);
        a=ii(a,b,c,d,M[i+12],6,1700485571); d=ii(d,a,b,c,M[i+3],10,-1894986606); c=ii(c,d,a,b,M[i+10],15,-1051523); b=ii(b,c,d,a,M[i+1],21,-2054922799);
        a=ii(a,b,c,d,M[i+8], 6,1873313359); d=ii(d,a,b,c,M[i+15],10,-30611744); c=ii(c,d,a,b,M[i+6],15,-1560198380); b=ii(b,c,d,a,M[i+13],21,1309151649);
        a=ii(a,b,c,d,M[i+4], 6,-145523070); d=ii(d,a,b,c,M[i+11],10,-1120210379); c=ii(c,d,a,b,M[i+2],15,718787259); b=ii(b,c,d,a,M[i+9],21,-343485551);
        a=safeAdd(a,oa); b=safeAdd(b,ob); c=safeAdd(c,oc); d=safeAdd(d,od);
    }
    return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}

// ─────────────────────────────────────────────────────────────────
//  HTTP(S) Helper
// ─────────────────────────────────────────────────────────────────
function httpRequest(options, body, callback) {
    const lib = options.protocol === "http:" ? http : https;
    const req = lib.request(options, (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", c => data += c);
        res.on("end", () => {
            try {
                callback(null, JSON.parse(data), res.statusCode);
            } catch (e) {
                callback(null, { _raw: data }, res.statusCode);
            }
        });
    });
    req.on("error", err => callback(err, null, 0));
    req.setTimeout(10000, () => { req.destroy(); callback(new Error("Timeout"), null, 0); });
    if (body) req.write(body);
    req.end();
}

function urlEncoded(params) {
    return Object.entries(params)
        .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
        .join("&");
}

// ─────────────────────────────────────────────────────────────────
//  Last.fm API
// ─────────────────────────────────────────────────────────────────
function lastfmRequest(cfg, params, callback) {
    // Signature: alle Params AUSSER api_sig/format, alphabetisch
    const excluded = new Set(["api_sig", "format"]);
    const sig = Object.keys(params)
        .filter(k => !excluded.has(k))
        .sort()
        .map(k => k + params[k])
        .join("") + cfg.apiSecret;
    params.api_sig = md5(sig);
    params.format  = "json";

    const body = urlEncoded(params);
    httpRequest({
        protocol: "https:",
        hostname: "ws.audioscrobbler.com",
        path:     "/2.0/",
        method:   "POST",
        headers:  {
            "Content-Type":   "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body),
            "User-Agent":     "node-red-contrib-scrobbler/1.0"
        }
    }, body, callback);
}

function lastfmNowPlaying(cfg, track, callback) {
    const params = {
        method:  "track.updateNowPlaying",
        api_key: cfg.apiKey,
        sk:      cfg.sessionKey,
        artist:  track.artist,
        track:   track.title
    };
    if (track.album)    params.album    = track.album;
    if (track.duration) params.duration = String(track.duration);
    lastfmRequest(cfg, params, callback);
}

function lastfmScrobble(cfg, track, callback) {
    const params = {
        method:    "track.scrobble",
        api_key:   cfg.apiKey,
        sk:        cfg.sessionKey,
        artist:    track.artist,
        track:     track.title,
        timestamp: String(track.timestamp)
    };
    if (track.album)    params.album    = track.album;
    if (track.duration) params.duration = String(track.duration);
    lastfmRequest(cfg, params, callback);
}

// ─────────────────────────────────────────────────────────────────
//  ListenBrainz API
// ─────────────────────────────────────────────────────────────────
function listenbrainzRequest(token, listenType, payload, callback) {
    const body = JSON.stringify({ listen_type: listenType, payload });
    httpRequest({
        protocol: "https:",
        hostname: "api.listenbrainz.org",
        path:     "/1/submit-listens",
        method:   "POST",
        headers:  {
            "Content-Type":   "application/json",
            "Content-Length": Buffer.byteLength(body),
            "Authorization":  "Token " + token,
            "User-Agent":     "node-red-contrib-scrobbler/1.0"
        }
    }, body, callback);
}

function lbzTrackMeta(track) {
    const meta = {
        artist_name: track.artist,
        track_name:  track.title
    };
    if (track.album) meta.release_name = track.album;
    if (track.duration || track.service) {
        meta.additional_info = {};
        if (track.duration) meta.additional_info.duration = track.duration;
        if (track.service)  meta.additional_info.music_service_name = track.service;
    }
    return meta;
}

function listenbrainzNowPlaying(token, track, callback) {
    listenbrainzRequest(token, "playing_now",
        [{ track_metadata: lbzTrackMeta(track) }],
        callback);
}

function listenbrainzScrobble(token, track, callback) {
    listenbrainzRequest(token, "single",
        [{ listened_at: track.timestamp, track_metadata: lbzTrackMeta(track) }],
        callback);
}

// ─────────────────────────────────────────────────────────────────
//  NODE-RED MODULE
// ─────────────────────────────────────────────────────────────────
module.exports = function (RED) {

    // ══════════════════════════════════════════════════════════════
    //  CONFIG NODE – scrobbler-config
    // ══════════════════════════════════════════════════════════════
    function ScrobblerConfigNode(config) {
        RED.nodes.createNode(this, config);

        this.name = config.name;

        // Last.fm
        this.lastfmEnabled    = config.lastfmEnabled === true || config.lastfmEnabled === "true";
        this.lastfmApiKey     = (this.credentials && this.credentials.lastfmApiKey)     || config.lastfmApiKey     || "";
        this.lastfmApiSecret  = (this.credentials && this.credentials.lastfmApiSecret)  || config.lastfmApiSecret  || "";
        this.lastfmSessionKey = (this.credentials && this.credentials.lastfmSessionKey) || config.lastfmSessionKey || "";

        // ListenBrainz
        this.lbzEnabled = config.lbzEnabled === true || config.lbzEnabled === "true";
        this.lbzToken   = (this.credentials && this.credentials.lbzToken) || config.lbzToken || "";
    }
    RED.nodes.registerType("scrobbler-config", ScrobblerConfigNode, {
        credentials: {
            lastfmApiKey:     { type: "password" },
            lastfmApiSecret:  { type: "password" },
            lastfmSessionKey: { type: "password" },
            lbzToken:         { type: "password" }
        }
    });

    // ══════════════════════════════════════════════════════════════
    //  MAIN NODE – scrobbler
    // ══════════════════════════════════════════════════════════════
    function ScrobblerNode(config) {
        RED.nodes.createNode(this, config);

        const node = this;
        node.cfg         = RED.nodes.getNode(config.config);
        node.scrobbleAfter = Math.max(10, parseInt(config.scrobbleAfter, 10) || 30); // seconds

        // Field-mapping (defaults match bluesound node output)
        node.fieldArtist   = config.fieldArtist   || "artist";
        node.fieldTitle    = config.fieldTitle     || "title";
        node.fieldAlbum    = config.fieldAlbum     || "album";
        node.fieldState    = config.fieldState     || "state";
        node.fieldDuration = config.fieldDuration  || "totlen";
        node.fieldService  = config.fieldService   || "service";

        // State
        let pendingTimer   = null;
        let lastTrack      = null;

        if (!node.cfg) {
            node.status({ fill: "red", shape: "ring", text: "kein Scrobbler-Profil" });
            node.error("Kein Scrobbler-Profil konfiguriert");
            return;
        }

        // lbzEnabled kann als Boolean true oder String "true" ankommen
        const toBool = v => v === true || v === "true" || v === 1;

        const lfmOk = toBool(node.cfg.lastfmEnabled) && node.cfg.lastfmApiKey && node.cfg.lastfmSessionKey;
        const lbzOk = toBool(node.cfg.lbzEnabled)    && node.cfg.lbzToken;

        if (!lfmOk && !lbzOk) {
            node.status({ fill: "yellow", shape: "ring", text: "kein Dienst aktiv" });
            node.warn("Scrobbler: Weder Last.fm noch ListenBrainz sind vollständig konfiguriert.\n" +
                      "  lbzEnabled=" + node.cfg.lbzEnabled + "  lbzToken=" + (node.cfg.lbzToken ? "(gesetzt)" : "(leer)") + "\n" +
                      "  lfmEnabled=" + node.cfg.lastfmEnabled + "  lfmApiKey=" + (node.cfg.lastfmApiKey ? "(gesetzt)" : "(leer)"));
            return;
        }

        // ── Startup: Token validieren ──────────────────────────────
        node.status({ fill: "yellow", shape: "ring", text: "verbinde…" });

        let validated = { lbz: !lbzOk, lfm: !lfmOk }; // pre-true if not needed
        let errors    = [];

        function onValidated() {
            if (!validated.lbz || !validated.lfm) return; // noch ausstehend
            if (errors.length) {
                node.status({ fill: "red", shape: "dot", text: errors.join(", ") });
                node.error("Scrobbler Verbindungsfehler: " + errors.join("; "));
            } else {
                const services = [lfmOk && "Last.fm", lbzOk && "ListenBrainz"].filter(Boolean).join(" + ");
                node.status({ fill: "green", shape: "dot", text: "✓ " + services });
            }
        }

        if (lbzOk) {
            // ListenBrainz: GET /1/validate-token
            httpRequest({
                protocol: "https:",
                hostname: "api.listenbrainz.org",
                path:     "/1/validate-token",
                method:   "GET",
                headers:  {
                    "Authorization": "Token " + node.cfg.lbzToken,
                    "User-Agent":    "node-red-contrib-scrobbler/1.0"
                }
            }, null, (err, res, code) => {
                if (err) {
                    errors.push("ListenBrainz: " + err.message);
                } else if (!res.valid) {
                    errors.push("ListenBrainz: Token ungültig");
                    node.error("ListenBrainz Token ungültig – bitte prüfen");
                } else {
                    node.log("ListenBrainz verbunden als: " + res.user_name);
                }
                validated.lbz = true;
                onValidated();
            });
        }

        if (lfmOk) {
            // Last.fm: auth.getSessionInfo als leichtgewichtiger Check
            lastfmRequest({
                apiKey:     node.cfg.lastfmApiKey,
                apiSecret:  node.cfg.lastfmApiSecret,
                sessionKey: node.cfg.lastfmSessionKey
            }, {
                method:  "auth.getSessionInfo",
                api_key: node.cfg.lastfmApiKey,
                sk:      node.cfg.lastfmSessionKey
            }, (err, res) => {
                if (err) {
                    errors.push("Last.fm: " + err.message);
                } else if (res.error) {
                    errors.push("Last.fm: " + res.message);
                    node.error("Last.fm Fehler " + res.error + ": " + res.message);
                } else {
                    const user = res.session && res.session.name;
                    node.log("Last.fm verbunden als: " + user);
                }
                validated.lfm = true;
                onValidated();
            });
        }

        // ── Helper ──────────────────────────────────────────────
        function getField(obj, field) {
            if (!field) return undefined;
            return field.split(".").reduce((o, k) => o && o[k] !== undefined ? o[k] : undefined, obj);
        }

        function statusLabel(track) {
            return ((track.artist || "?") + " – " + (track.title || "?")).substring(0, 45);
        }

        function sendResult(type, track, service, ok, detail) {
            node.send({
                topic:   type,           // "nowplaying" | "scrobble"
                service: service,        // "lastfm" | "listenbrainz"
                payload: { type, service, track, ok, detail }
            });
        }

        // ── Now Playing ─────────────────────────────────────────
        function doNowPlaying(track) {
            if (lfmOk) {
                lastfmNowPlaying({
                    apiKey:     node.cfg.lastfmApiKey,
                    apiSecret:  node.cfg.lastfmApiSecret,
                    sessionKey: node.cfg.lastfmSessionKey
                }, track, (err, res) => {
                    if (err) { node.error("[Last.fm] Now Playing Fehler: " + err.message); return; }
                    if (res.error) { node.error("[Last.fm] Now Playing API-Fehler " + res.error + ": " + res.message); return; }
                    node.log("[Last.fm] Now Playing: " + statusLabel(track));
                    sendResult("nowplaying", track, "lastfm", true, res);
                });
            }
            if (lbzOk) {
                listenbrainzNowPlaying(node.cfg.lbzToken, track, (err, res, code) => {
                    if (err) { node.error("[ListenBrainz] Now Playing Fehler: " + err.message); return; }
                    if (code < 200 || code > 299) { node.error("[ListenBrainz] Now Playing HTTP " + code + ": " + JSON.stringify(res)); return; }
                    node.log("[ListenBrainz] Now Playing: " + statusLabel(track));
                    sendResult("nowplaying", track, "listenbrainz", true, res);
                });
            }
        }

        // ── Scrobble ────────────────────────────────────────────
        function doScrobble(track) {
            if (lfmOk) {
                lastfmScrobble({
                    apiKey:     node.cfg.lastfmApiKey,
                    apiSecret:  node.cfg.lastfmApiSecret,
                    sessionKey: node.cfg.lastfmSessionKey
                }, track, (err, res) => {
                    if (err) { node.error("[Last.fm] Scrobble Fehler: " + err.message); return; }
                    if (res.error) { node.error("[Last.fm] Scrobble API-Fehler " + res.error + ": " + res.message); return; }
                    node.log("[Last.fm] Scrobble: " + statusLabel(track));
                    node.status({ fill: "green", shape: "dot", text: "✓ " + statusLabel(track) });
                    sendResult("scrobble", track, "lastfm", true, res);
                });
            }
            if (lbzOk) {
                listenbrainzScrobble(node.cfg.lbzToken, track, (err, res, code) => {
                    if (err) { node.error("[ListenBrainz] Scrobble Fehler: " + err.message); return; }
                    if (code < 200 || code > 299) { node.error("[ListenBrainz] Scrobble HTTP " + code + ": " + JSON.stringify(res)); return; }
                    node.log("[ListenBrainz] Scrobble: " + statusLabel(track));
                    sendResult("scrobble", track, "listenbrainz", true, res);
                });
            }
        }

        // ── Cancel pending timer ─────────────────────────────────
        function cancelTimer() {
            if (pendingTimer) {
                clearTimeout(pendingTimer);
                pendingTimer = null;
            }
        }

        // ── Input handler ────────────────────────────────────────
        node.on("input", function (msg) {
            const data = msg.payload;
            if (!data || typeof data !== "object") return;

            const state    = getField(data, node.fieldState) || "";
            const artist   = getField(data, node.fieldArtist) || "";
            const title    = getField(data, node.fieldTitle)  || "";
            const album    = getField(data, node.fieldAlbum)  || "";
            const totlen   = parseInt(getField(data, node.fieldDuration), 10) || 0;
            const service  = getField(data, node.fieldService) || "";

            // ── Stop / Pause → Timer abbrechen ───────────────
            if (state === "stop" || state === "pause" || state === "") {
                cancelTimer();
                node.status({ fill: "grey", shape: "ring", text: state || "idle" });
                return;
            }

            // ── Playing but no usable track info ────────────
            if (state !== "play" || !artist || !title) return;

            const track = { artist, title, album, duration: totlen || undefined, service,
                            timestamp: Math.floor(Date.now() / 1000) };

            // ── Same track still playing → ignore ────────────
            const isNew = !lastTrack
                || lastTrack.artist !== artist
                || lastTrack.title  !== title;

            if (!isNew) return;

            // ── New track ────────────────────────────────────
            cancelTimer(); // cancel previous pending scrobble

            // Skip tracks shorter than 30s (Last.fm rule)
            if (totlen > 0 && totlen < 30) {
                node.log("Track zu kurz zum Scrobbeln (<30s): " + statusLabel(track));
                lastTrack = track;
                return;
            }

            lastTrack = track;
            node.status({ fill: "blue", shape: "dot", text: "▶ " + statusLabel(track) });

            // Now Playing sofort
            doNowPlaying(track);

            // Scrobble nach konfigurierten Sekunden
            // (Last.fm: frühestens nach 30s ODER 50% der Titellänge, max 4 Min)
            let delay = node.scrobbleAfter * 1000;
            if (totlen > 0) {
                const halfLen = Math.floor(totlen / 2) * 1000;
                const fourMin = 4 * 60 * 1000;
                delay = Math.min(halfLen, fourMin, delay < halfLen ? delay : halfLen);
                delay = Math.max(delay, 30 * 1000); // mindestens 30s
            }

            pendingTimer = setTimeout(() => {
                pendingTimer = null;
                doScrobble(track);
            }, delay);
        });

        node.on("close", function (done) {
            cancelTimer();
            done();
        });
    }

    RED.nodes.registerType("scrobbler", ScrobblerNode);

    // ══════════════════════════════════════════════════════════════
    //  Last.fm AUTH HELPER – scrobbler-lastfm-auth
    //  Hilfs-Node für die einmalige Authentifizierung
    // ══════════════════════════════════════════════════════════════
    function ScrobblerLastfmAuthNode(config) {
        RED.nodes.createNode(this, config);

        const node = this;
        node.apiKey    = "";
        node.apiSecret = "";
        node.token     = "";

        node.status({ fill: "grey", shape: "ring", text: "bereit" });

        node.on("input", function (msg) {
            const step = msg.step || (msg.payload && msg.payload.step) || 1;

            if (step == 1) {
                // Schritt 1: API Key + Secret → Token holen + Auth-URL erzeugen
                node.apiKey    = msg.apiKey    || (msg.payload && msg.payload.apiKey)    || node.apiKey;
                node.apiSecret = msg.apiSecret || (msg.payload && msg.payload.apiSecret) || node.apiSecret;

                if (!node.apiKey || !node.apiSecret) {
                    node.error("msg.apiKey und msg.apiSecret müssen gesetzt sein");
                    return;
                }

                const sig = md5("api_key" + node.apiKey + "methodauth.getToken" + node.apiSecret);
                const url = "https://ws.audioscrobbler.com/2.0/?method=auth.getToken&api_key="
                           + node.apiKey + "&api_sig=" + sig + "&format=json";

                httpRequest({
                    protocol: "https:",
                    hostname: "ws.audioscrobbler.com",
                    path:     "/2.0/?method=auth.getToken&api_key=" + node.apiKey
                              + "&api_sig=" + sig + "&format=json",
                    method:   "GET"
                }, null, (err, res) => {
                    if (err || res.error) {
                        node.error("Token-Fehler: " + (err ? err.message : res.message));
                        node.status({ fill: "red", shape: "ring", text: "Token-Fehler" });
                        return;
                    }
                    node.token = res.token;
                    const authUrl = "https://www.last.fm/api/auth/?api_key=" + node.apiKey + "&token=" + node.token;
                    node.status({ fill: "yellow", shape: "dot", text: "Browser-Auth ausstehend…" });
                    node.send({
                        step: 1,
                        payload: { authUrl, token: node.token,
                                   anweisung: "Schritt 1: Öffne authUrl im Browser, bestätige die App, dann Schritt 2 auslösen" }
                    });
                });

            } else if (step == 2) {
                // Schritt 2: Token → Session Key
                if (!node.token) {
                    node.error("Noch kein Token — bitte zuerst Schritt 1 ausführen");
                    return;
                }
                const sig = md5("api_key" + node.apiKey + "methodauth.getSession" + "token" + node.token + node.apiSecret);
                httpRequest({
                    protocol: "https:",
                    hostname: "ws.audioscrobbler.com",
                    path:     "/2.0/?method=auth.getSession&api_key=" + node.apiKey
                              + "&token=" + node.token + "&api_sig=" + sig + "&format=json",
                    method:   "GET"
                }, null, (err, res) => {
                    if (err || res.error) {
                        node.error("Session-Fehler: " + (err ? err.message : res.message));
                        node.status({ fill: "red", shape: "ring", text: "Session-Fehler" });
                        return;
                    }
                    const sessionKey = res.session && res.session.key;
                    const username   = res.session && res.session.name;
                    node.status({ fill: "green", shape: "dot", text: "✓ " + username });
                    node.send({
                        step: 2,
                        payload: { sessionKey, username,
                                   anweisung: "Fertig! sessionKey in das Scrobbler-Profil eintragen und dort speichern." }
                    });
                });
            }
        });
    }
    RED.nodes.registerType("scrobbler-lastfm-auth", ScrobblerLastfmAuthNode);
};
