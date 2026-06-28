# node-red-contrib-scrobbler

Node-RED Node zum Scrobbeln zu **Last.fm** und/oder **ListenBrainz**.  
Funktioniert direkt mit [`node-red-contrib-bluesound`](https://github.com/elvito/node-red-contrib-bluesound) und jeder anderen Quelle, die Wiedergabedaten als `msg.payload` liefert.

Keine externen Abhängigkeiten — kein zusätzliches `npm install` nötig.  
MD5-Signaturen (für Last.fm) werden über das eingebaute Node.js `crypto`-Modul berechnet.

> ⚠️ **Hinweis:** Dieser Node wurde mit KI-Unterstützung (Claude / Anthropic) erstellt.  
> Er funktioniert, wird aber ohne Garantie auf Dauerhaftigkeit oder Vollständigkeit bereitgestellt.

---

## Enthaltene Nodes

### `scrobbler-config` (Config-Node)
Speichert Zugangsdaten für Last.fm und/oder ListenBrainz. Beide Dienste können gleichzeitig aktiv sein.

### `scrobbler` (Haupt-Node)
Empfängt `msg.payload`, erkennt Titelwechsel, meldet **Now Playing** sofort und sendet **Scrobbles** zum richtigen Zeitpunkt.

### `scrobbler-lastfm-auth` (Einmaliger Hilfs-Node)
Führt den Last.fm-Authentifizierungsflow durch und liefert den Session Key — muss nur einmal ausgeführt werden.

---

## Passende Nodes

Dieser Node ist auf die Ausgabe von [`node-red-contrib-bluesound`](https://github.com/elvito/node-red-contrib-bluesound) ausgelegt. Der Bluesound-Node liefert Wiedergabedaten (Titel, Artist, Album, State, Länge) direkt im Format, das der Scrobbler erwartet — ohne weiteres Mapping.

```
[bluesound-status] ──→ [scrobbler]
```

---

## Installation

```bash
cd ~/.node-red
npm install elvito/node-red-contrib-scrobbler
node-red-restart
```

## Update

```bash
cd ~/.node-red
npm install elvito/node-red-contrib-scrobbler
node-red-restart
```

Da das Paket direkt von GitHub installiert wird, zieht `npm install` immer den aktuellen Stand aus dem `main`-Branch.

---

## Einrichtung

### 1. ListenBrainz

1. Auf [listenbrainz.org/profile](https://listenbrainz.org/profile/) einloggen
2. Den **User Token** kopieren
3. Einen `scrobbler-config` Node anlegen, ListenBrainz aktivieren, Token eintragen, deployen

### 2. Last.fm — einmaliger Auth-Flow

Last.fm benötigt einen dauerhaften **Session Key**, der einmalig über einen 2-Schritt-Prozess geholt wird.

#### Vorbereitung

1. API Key + Secret auf [last.fm/api/account/create](https://www.last.fm/api/account/create) erstellen
2. Den `scrobbler-lastfm-auth` Node in Node-RED platzieren
3. Zwei **Inject-Nodes** anlegen und mit dem Auth-Node verbinden
4. Einen **Debug-Node** an den Ausgang des Auth-Nodes hängen (auf „komplette msg" stellen)

#### Schritt 1 — Token holen & Browser-Link erhalten

Ersten Inject-Node so konfigurieren:

- **msg.payload** → Typ: `JSON`
- Wert:
```json
{
  "step": 1,
  "apiKey": "dein-api-key",
  "apiSecret": "dein-api-secret"
}
```

Inject auslösen. Der Node holt automatisch einen Token von der Last.fm API und gibt im Debug-Panel sowie als Node-RED Warnung eine **Auth-URL** aus. Diese URL im Browser öffnen und die App bei Last.fm **Allow** klicken.

#### Schritt 2 — Session Key abrufen

Direkt nach dem Klick auf „Allow" den zweiten Inject-Node auslösen:

- **msg.payload** → Typ: `JSON`
- Wert:
```json
{
  "step": 2
}
```

Der Node antwortet mit dem **Session Key** im Debug-Panel (`msg.payload.key`).

> ⚠️ Schritt 2 muss zeitnah nach der Browser-Autorisierung ausgeführt werden — der Token läuft sonst ab.

#### Schritt 3 — Session Key eintragen

Den Session Key in den `scrobbler-config` Node eintragen (Feld „Session Key") und deployen. Fertig — der Session Key ist dauerhaft gültig und muss nie erneuert werden.

---

## Feld-Mapping

Standard-Felder (passend für `bluesound-status`):

| Feld     | Standard  | Beschreibung              |
|----------|-----------|---------------------------|
| State    | `state`   | `play` / `pause` / `stop` |
| Artist   | `artist`  | Interpret                 |
| Title    | `name`    | Titelname                 |
| Album    | `album`   | Album                     |
| Duration | `totlen`  | Gesamtlänge in Sekunden   |
| Service  | `service` | Musik-Dienst (z.B. Tidal) |

Für andere Quellen können die Feldnamen im `scrobbler` Node unter **„Feld-Mapping anpassen"** geändert werden.

---

## Scrobble-Logik

- **Now Playing** wird sofort gemeldet wenn ein neuer Titel erkannt wird
- **Scrobble** wird nach dem konfigurierten Delay gesendet (Standard 30s), aber frühestens nach 50% der Titellänge (Last.fm-Regel)
- Tracks unter 30 Sekunden werden nicht gescrobbelt
- Pause/Stop bricht ausstehende Scrobble-Timer ab
- Doppelte Updates (gleicher Titel) werden ignoriert

---

## Ausgabe

```json
{
  "topic": "nowplaying",
  "service": "lastfm",
  "payload": {
    "type": "nowplaying",
    "service": "lastfm",
    "ok": true,
    "track": {
      "artist": "Radiohead",
      "title": "Creep",
      "album": "Pablo Honey",
      "duration": 238,
      "timestamp": 1234567890
    },
    "detail": {}
  }
}
```

`msg.topic` ist `"nowplaying"` oder `"scrobble"`, `msg.service` ist `"lastfm"` oder `"listenbrainz"`.

---

## Lizenz

MIT
