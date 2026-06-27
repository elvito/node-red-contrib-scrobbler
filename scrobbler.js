'use strict';

// Kein externes md5-Paket nötig — Node.js crypto ist built-in
const crypto  = require('crypto');
const https   = require('https');
const http    = require('http');
const { URL } = require('url');

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * MD5-Hash via Node.js built-in crypto (ersetzt externes md5-Paket).
 * utf8-Encoding ist wichtig für korrekte Signaturen bei Umlauten/Sonderzeichen.
 */
function md5(str) {
  return crypto.createHash('md5').update(String(str), 'utf8').digest('hex');
}

/**
 * Last.fm API-Signatur gemäß https://www.last.fm/api/authspec#_8-signing-calls
 * Alle Parameter außer 'format' und 'callback' alphabetisch sortieren,
 * als key+value aneinanderhängen, secret anhängen, dann MD5.
 */
function signLastFm(params, secret) {
  const sigStr = Object.keys(params)
    .filter(k => k !== 'format' && k !== 'callback')
    .sort()
    .map(k => k + params[k])
    .join('') + secret;
  return md5(sigStr);
}

/**
 * Einfacher HTTP/HTTPS POST mit URL-encoded Body, gibt Promise<string> zurück.
 */
function httpPost(urlStr, body) {
  return new Promise((resolve, reject) => {
    const u        = new URL(urlStr);
    const postData = new URLSearchParams(body).toString();
    const isHttps  = u.protocol === 'https:';
    const options  = {
      hostname: u.hostname,
      port:     u.port || (isHttps ? 443 : 80),
      path:     u.pathname + u.search,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent':     'node-red-contrib-scrobbler/1.0',
      },
    };
    const lib = isHttps ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end',  ()    => { resolve(data); });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Einfacher HTTP/HTTPS GET, gibt Promise<string> zurück.
 */
function httpGet(urlStr) {
  return new Promise((resolve, reject) => {
    const u       = new URL(urlStr);
    const isHttps = u.protocol === 'https:';
    const options = {
      hostname: u.hostname,
      port:     u.port || (isHttps ? 443 : 80),
      path:     u.pathname + u.search,
      method:   'GET',
      headers:  { 'User-Agent': 'node-red-contrib-scrobbler/1.0' },
    };
    const lib = isHttps ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end',  ()    => { resolve(data); });
    });
    req.on('error', reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Last.fm API-Aufrufe
// ---------------------------------------------------------------------------

const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';

/**
 * Schritt 1 des Last.fm Web Auth Flow: Auth-URL zurückgeben.
 * Der Nutzer muss diese URL im Browser öffnen und die App autorisieren.
 */
function lastFmGetAuthUrl(apiKey) {
  return `https://www.last.fm/api/auth/?api_key=${apiKey}`;
}

/**
 * Schritt 2: Token gegen Session Key tauschen (auth.getSession).
 */
async function lastFmGetSession(apiKey, apiSecret, token) {
  const params = {
    method:  'auth.getSession',
    api_key: apiKey,
    token:   token,
  };
  params.api_sig = signLastFm(params, apiSecret);
  params.format  = 'json';

  const raw  = await httpPost(LASTFM_API_URL, params);
  const json = JSON.parse(raw);

  if (json.error) {
    throw new Error(`Last.fm auth.getSession Fehler ${json.error}: ${json.message}`);
  }
  return json.session; // { name, key, subscriber }
}

/**
 * Now Playing an Last.fm melden (track.updateNowPlaying).
 */
async function lastFmNowPlaying(apiKey, apiSecret, sessionKey, track) {
  const params = {
    method:   'track.updateNowPlaying',
    api_key:  apiKey,
    sk:       sessionKey,
    artist:   track.artist   || '',
    track:    track.title    || '',
    album:    track.album    || '',
    duration: track.duration || '',
  };
  params.api_sig = signLastFm(params, apiSecret);
  params.format  = 'json';

  const raw  = await httpPost(LASTFM_API_URL, params);
  const json = JSON.parse(raw);

  if (json.error) {
    throw new Error(`Last.fm nowplaying Fehler ${json.error}: ${json.message}`);
  }
  return json;
}

/**
 * Scrobble an Last.fm senden (track.scrobble).
 */
async function lastFmScrobble(apiKey, apiSecret, sessionKey, track) {
  const params = {
    method:      'track.scrobble',
    api_key:     apiKey,
    sk:          sessionKey,
    'artist[0]': track.artist    || '',
    'track[0]':  track.title     || '',
    'album[0]':  track.album     || '',
    'timestamp[0]': track.timestamp || Math.floor(Date.now() / 1000),
    'duration[0]':  track.duration || '',
  };
  params.api_sig = signLastFm(params, apiSecret);
  params.format  = 'json';

  const raw  = await httpPost(LASTFM_API_URL, params);
  const json = JSON.parse(raw);

  if (json.error) {
    throw new Error(`Last.fm scrobble Fehler ${json.error}: ${json.message}`);
  }
  return json;
}

// ---------------------------------------------------------------------------
// ListenBrainz API-Aufrufe
// ---------------------------------------------------------------------------

const LB_API_URL = 'https://api.listenbrainz.org/1/submit-listens';

/**
 * Listen an ListenBrainz senden.
 * listenType: 'playing_now' oder 'single'
 */
async function listenBrainzSubmit(userToken, listenType, track) {
  const payload = {
    listen_type: listenType,
    payload: [{
      track_metadata: {
        artist_name:  track.artist || '',
        track_name:   track.title  || '',
        release_name: track.album  || '',
        additional_info: {
          media_player: 'node-red-contrib-scrobbler',
          music_service: track.service || undefined,
          duration_ms: track.duration ? track.duration * 1000 : undefined,
        },
      },
    }],
  };

  // Bei 'single' (echtes Scrobble) muss listened_at gesetzt sein
  if (listenType === 'single') {
    payload.payload[0].listened_at = track.timestamp || Math.floor(Date.now() / 1000);
  }

  // ListenBrainz erwartet JSON per POST mit Bearer-Token
  return new Promise((resolve, reject) => {
    const body    = JSON.stringify(payload);
    const u       = new URL(LB_API_URL);
    const options = {
      hostname: u.hostname,
      port:     443,
      path:     u.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization':  `Token ${userToken}`,
        'User-Agent':     'node-red-contrib-scrobbler/1.0',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end',  ()    => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(`ListenBrainz Fehler ${res.statusCode}: ${json.error || data}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`ListenBrainz Parse-Fehler: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Node-RED Node-Definitionen
// ---------------------------------------------------------------------------

module.exports = function (RED) {

  // -------------------------------------------------------------------------
  // scrobbler-config — Config-Node (Zugangsdaten)
  // -------------------------------------------------------------------------
  function ScrobblerConfigNode(config) {
    RED.nodes.createNode(this, config);
    // Last.fm
    this.lastfmApiKey    = config.lastfmApiKey    || '';
    this.lastfmApiSecret = config.lastfmApiSecret || '';
    this.lastfmSessionKey = config.lastfmSessionKey || '';
    this.lastfmEnabled   = !!(this.lastfmApiKey && this.lastfmApiSecret && this.lastfmSessionKey);
    // ListenBrainz
    this.lbToken   = config.lbToken   || '';
    this.lbEnabled = !!this.lbToken;
  }
  RED.nodes.registerType('scrobbler-config', ScrobblerConfigNode, {
    credentials: {
      lastfmApiKey:     { type: 'password' },
      lastfmApiSecret:  { type: 'password' },
      lastfmSessionKey: { type: 'password' },
      lbToken:          { type: 'password' },
    },
  });

  // -------------------------------------------------------------------------
  // scrobbler — Haupt-Node
  // -------------------------------------------------------------------------
  function ScrobblerNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.configNode = RED.nodes.getNode(config.config);
    if (!node.configNode) {
      node.error('Kein scrobbler-config Node ausgewählt.');
      return;
    }

    // Feld-Mapping (konfigurierbar, mit sinnvollen Defaults für bluesound)
    const F = {
      state:    config.fieldState    || 'state',
      artist:   config.fieldArtist   || 'artist',
      title:    config.fieldTitle    || 'title',
      album:    config.fieldAlbum    || 'album',
      duration: config.fieldDuration || 'totlen',
      service:  config.fieldService  || 'service',
    };

    const scrobbleDelay = (parseInt(config.scrobbleDelay, 10) || 30) * 1000; // ms
    const MIN_DURATION  = 30; // Tracks kürzer als 30s werden nicht gescrobbelt (Last.fm-Regel)

    let currentTrack   = null;
    let scrobbleTimer  = null;
    let nowPlayingDone = false;
    let trackStartTime = null;

    function clearScrobbleTimer() {
      if (scrobbleTimer) {
        clearTimeout(scrobbleTimer);
        scrobbleTimer = null;
      }
    }

    function extractTrack(payload) {
      return {
        artist:    payload[F.artist]   || '',
        title:     payload[F.title]    || '',
        album:     payload[F.album]    || '',
        duration:  parseInt(payload[F.duration], 10) || 0,
        service:   payload[F.service]  || '',
        timestamp: Math.floor(Date.now() / 1000),
      };
    }

    function isSameTrack(a, b) {
      if (!a || !b) return false;
      return a.artist === b.artist && a.title === b.title && a.album === b.album;
    }

    async function doNowPlaying(track) {
      const cfg = node.configNode;
      const results = [];

      if (cfg.lastfmEnabled) {
        try {
          const detail = await lastFmNowPlaying(
            cfg.lastfmApiKey, cfg.lastfmApiSecret, cfg.lastfmSessionKey, track
          );
          results.push({ service: 'lastfm', ok: true, detail });
          node.send({
            topic:   'nowplaying',
            service: 'lastfm',
            payload: { type: 'nowplaying', service: 'lastfm', ok: true, track, detail },
          });
        } catch (e) {
          node.warn(`Last.fm Now Playing: ${e.message}`);
          results.push({ service: 'lastfm', ok: false, error: e.message });
        }
      }

      if (cfg.lbEnabled) {
        try {
          const detail = await listenBrainzSubmit(cfg.lbToken, 'playing_now', track);
          results.push({ service: 'listenbrainz', ok: true, detail });
          node.send({
            topic:   'nowplaying',
            service: 'listenbrainz',
            payload: { type: 'nowplaying', service: 'listenbrainz', ok: true, track, detail },
          });
        } catch (e) {
          node.warn(`ListenBrainz Now Playing: ${e.message}`);
          results.push({ service: 'listenbrainz', ok: false, error: e.message });
        }
      }

      return results;
    }

    async function doScrobble(track) {
      const cfg = node.configNode;

      if (cfg.lastfmEnabled) {
        try {
          const detail = await lastFmScrobble(
            cfg.lastfmApiKey, cfg.lastfmApiSecret, cfg.lastfmSessionKey, track
          );
          node.send({
            topic:   'scrobble',
            service: 'lastfm',
            payload: { type: 'scrobble', service: 'lastfm', ok: true, track, detail },
          });
        } catch (e) {
          node.warn(`Last.fm Scrobble: ${e.message}`);
        }
      }

      if (cfg.lbEnabled) {
        try {
          const detail = await listenBrainzSubmit(cfg.lbToken, 'single', track);
          node.send({
            topic:   'scrobble',
            service: 'listenbrainz',
            payload: { type: 'scrobble', service: 'listenbrainz', ok: true, track, detail },
          });
        } catch (e) {
          node.warn(`ListenBrainz Scrobble: ${e.message}`);
        }
      }
    }

    function scheduleScrobble(track) {
      clearScrobbleTimer();

      if (track.duration > 0 && track.duration < MIN_DURATION) {
        node.debug(`Track zu kurz (${track.duration}s), wird nicht gescrobbelt.`);
        return;
      }

      // Scrobble frühestens nach 50% der Titellänge ODER nach scrobbleDelay (je nachdem was später ist)
      let delay = scrobbleDelay;
      if (track.duration > 0) {
        const halfDuration = (track.duration * 1000) / 2;
        delay = Math.max(delay, halfDuration);
      }

      node.debug(`Scrobble geplant in ${Math.round(delay / 1000)}s für "${track.artist} - ${track.title}"`);
      scrobbleTimer = setTimeout(() => {
        doScrobble(track).catch(e => node.warn(e.message));
      }, delay);
    }

    node.on('input', async function (msg) {
      const payload = msg.payload;
      if (!payload || typeof payload !== 'object') return;

      const state = (payload[F.state] || '').toLowerCase();

      if (state === 'pause' || state === 'stop') {
        clearScrobbleTimer();
        node.status({ fill: 'grey', shape: 'ring', text: state });
        return;
      }

      if (state !== 'play') return;

      const track = extractTrack(payload);

      if (!track.artist || !track.title) {
        node.debug('Kein Künstler oder Titel — übersprungen.');
        return;
      }

      if (isSameTrack(track, currentTrack) && nowPlayingDone) {
        // Gleicher Track, kein erneutes Now Playing nötig
        return;
      }

      // Neuer Track
      clearScrobbleTimer();
      currentTrack   = track;
      nowPlayingDone = false;
      trackStartTime = Date.now();

      node.status({ fill: 'green', shape: 'dot', text: `${track.artist} – ${track.title}` });
      node.debug(`Neuer Track: ${track.artist} – ${track.title}`);

      try {
        await doNowPlaying(track);
        nowPlayingDone = true;
      } catch (e) {
        node.warn(`Now Playing fehlgeschlagen: ${e.message}`);
      }

      scheduleScrobble(track);
    });

    node.on('close', function () {
      clearScrobbleTimer();
    });
  }
  RED.nodes.registerType('scrobbler', ScrobblerNode);

  // -------------------------------------------------------------------------
  // scrobbler-lastfm-auth — Einmaliger Auth-Hilfs-Node
  // -------------------------------------------------------------------------
  function ScrobblerLastFmAuthNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Temporärer Speicher für API-Key/Secret zwischen Schritt 1 und 2
    let tempApiKey    = '';
    let tempApiSecret = '';

    node.on('input', async function (msg) {
      const payload = msg.payload || {};
      const step    = payload.step;

      if (step === 1) {
        // Schritt 1: Auth-URL ausgeben
        tempApiKey    = payload.apiKey    || config.apiKey    || '';
        tempApiSecret = payload.apiSecret || config.apiSecret || '';

        if (!tempApiKey || !tempApiSecret) {
          node.error('Schritt 1: apiKey und apiSecret müssen in msg.payload übergeben werden.');
          return;
        }

        const authUrl = lastFmGetAuthUrl(tempApiKey);
        node.warn(`Öffne diese URL im Browser und autorisiere die App:\n${authUrl}`);
        node.send({ topic: 'lastfm-auth-url', payload: authUrl });
        node.status({ fill: 'yellow', shape: 'ring', text: 'Warte auf Browser-Autorisierung...' });

      } else if (step === 2) {
        // Schritt 2: Token gegen Session Key tauschen
        const token = payload.token || '';
        if (!token) {
          node.error('Schritt 2: token muss in msg.payload.token übergeben werden.');
          return;
        }
        if (!tempApiKey || !tempApiSecret) {
          node.error('Schritt 2: Bitte zuerst Schritt 1 ausführen (apiKey/apiSecret fehlen).');
          return;
        }

        try {
          const session = await lastFmGetSession(tempApiKey, tempApiSecret, token);
          node.warn(`Session Key erhalten! Trage diesen in den scrobbler-config Node ein:\n${session.key}`);
          node.send({ topic: 'lastfm-session', payload: session });
          node.status({ fill: 'green', shape: 'dot', text: `Session: ${session.name}` });
        } catch (e) {
          node.error(`Fehler beim Session-Key-Abruf: ${e.message}`);
          node.status({ fill: 'red', shape: 'ring', text: e.message });
        }

      } else {
        node.warn(`Unbekannter step: ${step}. Verwende step: 1 oder step: 2.`);
      }
    });
  }
  RED.nodes.registerType('scrobbler-lastfm-auth', ScrobblerLastFmAuthNode);

};
