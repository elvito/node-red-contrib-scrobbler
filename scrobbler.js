'use strict';

// Kein externes md5-Paket nötig — Node.js crypto ist built-in
const crypto  = require('crypto');
const https   = require('https');
const http    = require('http');
const { URL } = require('url');

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function md5(str) {
  return crypto.createHash('md5').update(String(str), 'utf8').digest('hex');
}

function signLastFm(params, secret) {
  const sigStr = Object.keys(params)
    .filter(k => k !== 'format' && k !== 'callback')
    .sort()
    .map(k => k + params[k])
    .join('') + secret;
  return md5(sigStr);
}

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

async function lastFmGetToken(apiKey, apiSecret) {
  const params = {
    method:  'auth.getToken',
    api_key: apiKey,
  };
  params.api_sig = signLastFm(params, apiSecret);
  params.format  = 'json';

  const raw  = await httpPost(LASTFM_API_URL, params);
  const json = JSON.parse(raw);

  if (json.error) {
    throw new Error(`Last.fm auth.getToken Fehler ${json.error}: ${json.message}`);
  }
  return json.token;
}

function lastFmBuildAuthUrl(apiKey, token) {
  return `https://www.last.fm/api/auth/?api_key=${apiKey}&token=${token}`;
}

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
  return json.session;
}

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

  if (listenType === 'single') {
    payload.payload[0].listened_at = track.timestamp || Math.floor(Date.now() / 1000);
  }

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
    this.lastfmApiKey     = (this.credentials && this.credentials.lastfmApiKey)     || '';
    this.lastfmApiSecret  = (this.credentials && this.credentials.lastfmApiSecret)  || '';
    this.lastfmSessionKey = (this.credentials && this.credentials.lastfmSessionKey) || '';
    this.lastfmEnabled = (config.lastfmEnabled === true || config.lastfmEnabled === 'true')
                         && !!(this.lastfmApiKey && this.lastfmApiSecret && this.lastfmSessionKey);
    this.lbToken   = (this.credentials && this.credentials.lbzToken) || '';
    this.lbEnabled = (config.lbzEnabled === true || config.lbzEnabled === 'true') && !!this.lbToken;
  }
  RED.nodes.registerType('scrobbler-config', ScrobblerConfigNode, {
    credentials: {
      lastfmApiKey:     { type: 'password' },
      lastfmApiSecret:  { type: 'password' },
      lastfmSessionKey: { type: 'password' },
      lbzToken:         { type: 'password' },
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

    const F = {
      state:    config.fieldState    || 'state',
      artist:   config.fieldArtist   || 'artist',
      title:    config.fieldTitle    || 'title',
      album:    config.fieldAlbum    || 'album',
      duration: config.fieldDuration || 'totlen',
      service:  config.fieldService  || 'service',
    };

    const scrobbleDelay = (parseInt(config.scrobbleAfter,  10) || 30) * 1000;
    const MIN_DURATION  = 30;

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
          node.send({
            topic:   'nowplaying',
            service: 'lastfm',
            payload: { type: 'nowplaying', service: 'lastfm', ok: false, track, error: e.message },
          });
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
          node.send({
            topic:   'nowplaying',
            service: 'listenbrainz',
            payload: { type: 'nowplaying', service: 'listenbrainz', ok: false, track, error: e.message },
          });
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
          node.send({
            topic:   'scrobble',
            service: 'lastfm',
            payload: { type: 'scrobble', service: 'lastfm', ok: false, track, error: e.message },
          });
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
          node.send({
            topic:   'scrobble',
            service: 'listenbrainz',
            payload: { type: 'scrobble', service: 'listenbrainz', ok: false, track, error: e.message },
          });
        }
      }
    }

    function scheduleScrobble(track) {
      clearScrobbleTimer();

      if (track.duration > 0 && track.duration < MIN_DURATION) {
        node.debug(`Track zu kurz (${track.duration}s), wird nicht gescrobbelt.`);
        return;
      }

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
        return;
      }

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

    let tempApiKey    = '';
    let tempApiSecret = '';
    let tempToken     = '';

    node.on('input', async function (msg) {
      const payload = (msg.payload && typeof msg.payload === 'object') ? msg.payload : {};
      const step = parseInt(
        payload.step ?? msg.payload ?? msg.topic ?? '',
        10
      );

      const apiKey    = payload.apiKey    || msg.apiKey    || config.apiKey    || '';
      const apiSecret = payload.apiSecret || msg.apiSecret || config.apiSecret || '';

      if (step === 1) {
        if (!apiKey || !apiSecret) {
          node.error('Schritt 1: apiKey und apiSecret müssen übergeben werden (in msg.payload, msg oder Node-Konfiguration).');
          return;
        }
        tempApiKey    = apiKey;
        tempApiSecret = apiSecret;

        try {
          node.status({ fill: 'blue', shape: 'ring', text: 'Hole Token von Last.fm...' });
          tempToken = await lastFmGetToken(tempApiKey, tempApiSecret);
          const authUrl = lastFmBuildAuthUrl(tempApiKey, tempToken);
          node.warn(`Öffne diese URL im Browser, autorisiere die App, dann Schritt 2 auslösen:\n${authUrl}`);
          node.send({ topic: 'lastfm-auth-url', payload: authUrl });
          node.status({ fill: 'yellow', shape: 'ring', text: 'Warte auf Browser-Autorisierung...' });
        } catch (e) {
          node.error(`Token-Abruf fehlgeschlagen: ${e.message}`);
          node.status({ fill: 'red', shape: 'ring', text: e.message });
        }

      } else if (step === 2) {
        if (!tempToken) {
          node.error('Schritt 2: Bitte zuerst Schritt 1 ausführen (kein Token vorhanden).');
          return;
        }
        if (!tempApiKey || !tempApiSecret) {
          node.error('Schritt 2: Bitte zuerst Schritt 1 ausführen (apiKey/apiSecret fehlen).');
          return;
        }

        try {
          const session = await lastFmGetSession(tempApiKey, tempApiSecret, tempToken);
          node.warn(`Session Key erhalten! Trage diesen in den scrobbler-config Node ein:\n${session.key}`);
          node.send({ topic: 'lastfm-session', payload: session });
          node.status({ fill: 'green', shape: 'dot', text: `Session: ${session.name}` });
          tempToken = '';
        } catch (e) {
          node.error(`Fehler beim Session-Key-Abruf: ${e.message}`);
          node.status({ fill: 'red', shape: 'ring', text: e.message });
        }

      } else {
        node.warn(`Unbekannter step: ${step}. Sende step: 1 oder step: 2 (als Zahl in msg.payload, payload.step oder msg.topic).`);
      }
    });
  }
  RED.nodes.registerType('scrobbler-lastfm-auth', ScrobblerLastFmAuthNode);

};
