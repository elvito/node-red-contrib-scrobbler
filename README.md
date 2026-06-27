# node-red-contrib-scrobbler

Node-RED Node zum Scrobbeln zu **Last.fm** und/oder **ListenBrainz**.  
Funktioniert direkt mit `node-red-contrib-bluesound` und jeder anderen Quelle.

Keine externen Abhängigkeiten — kein `npm install` nötig außer dem Paket selbst.

Diese Software wurde per KI generiert, daher keine Garantie, dass sie dauerhaft funktionieren wird.

## Installation

```bash
cd ~/.node-red
npm install elvito/node-red-contrib-scrobbler
# Node-RED neu starten
```

## Deinstallation

```bash
cd ~/.node-red && npm remove node-red-contrib-scrobbler
```

## Enthaltene Nodes

### scrobbler-config (Config)
Zugangsdaten für Last.fm und/oder ListenBrainz. Beide können gleichzeitig aktiv sein.

### scrobbler (Haupt-Node)
Empfängt `msg.payload` von einem Bluesound- oder anderen Musik-Node, erkennt
Titelwechsel und verwaltet den gesamten Scrobble-Prozess intern.

**Einfachster Setup:**
```
[bluesound-status] ──→ [scrobbler]
```
Das war's.

### scrobbler-lastfm-auth (Einmalig)
Hilfs-Node für die einmalige Last.fm Authentifizierung um den Session Key zu holen.

## Einrichtung

### ListenBrainz
1. Auf [listenbrainz.org/profile/](https://listenbrainz.org/profile/) einloggen
2. "User Token" kopieren
3. In den `scrobbler-config` Node eintragen

### Last.fm
1. API Key + Secret auf [last.fm/api/account/create](https://www.last.fm/api/account/create) erstellen
2. Den `scrobbler-lastfm-auth` Node in Node-RED platzieren
3. **Schritt 1:** Inject mit `{ step: 1, apiKey: "...", apiSecret: "..." }` → Auth-URL im Browser öffnen
4. **Schritt 2:** Inject mit `{ step: 2 }` → Session Key erscheint im Debug-Panel
5. Alle drei Werte in `scrobbler-config` eintragen

## Feld-Mapping

Standard-Felder (passend für `bluesound-status`):

| Feld | Standard | Beschreibung |
|---|---|---|
| State | `state` | `play` / `pause` / `stop` |
| Artist | `artist` | Interpret |
| Title | `title` | Titelname |
| Album | `album` | Album |
| Duration | `totlen` | Gesamtlänge in Sekunden |
| Service | `service` | Musik-Dienst (z.B. Tidal) |

Für andere Quellen können die Feldnamen in der Node-Konfiguration angepasst werden.

## Scrobble-Logik

- **Now Playing:** wird sofort gemeldet bei neuem Titel
- **Scrobble:** nach konfiguriertem Delay (Standard 30s), aber frühestens nach 50% der Titellänge (Last.fm-Regel)
- Tracks unter 30 Sekunden werden nicht gescrobbelt
- Pause/Stop bricht ausstehende Scrobbles ab
- Doppelte Updates (gleicher Titel) werden ignoriert

## Ausgabe

```js
// msg bei erfolgreichem Now Playing oder Scrobble:
{
  topic:   "nowplaying",       // oder "scrobble"
  service: "lastfm",           // oder "listenbrainz"
  payload: {
    type:  "nowplaying",
    service: "lastfm",
    ok:    true,
    track: { artist, title, album, duration, timestamp },
    detail: { /* API-Antwort */ }
  }
}
```

## Lizenz

MIT
