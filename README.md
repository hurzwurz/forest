# 🌱 Forest

Pflanze Blumen an echten Orten und sieh sie durch die Kamera deines Handys wachsen.

Forest funktioniert wie Pokémon Go, nur mit Garten statt Monstern: Du siehst die
echte Welt durch die Kamera, darüber liegen die Pflanzplätze in deiner Umgebung.
Was du pflanzt, bleibt an diesem Ort liegen.

**Zwei Betriebsarten, eine App.** Findet die App beim Start einen Server, spielen
alle in derselben Welt: Du siehst fremde Blumen, andere deine, und Gießen bringt
Erfahrung. Findet sie keinen — etwa auf GitHub Pages —, schaltet sie von selbst in
den Offline-Betrieb und rechnet im Browser. Dann gehört der Garten dir allein und
liegt auf deinem Gerät. Umzustellen ist dafür nichts.

---

## Schnellstart

Die Welt liegt in einer PostgreSQL-Datenbank. Am schnellsten geht es mit Docker:

```bash
docker compose up -d          # Datenbank und App zusammen
```

Dann <http://localhost:3000> im Browser öffnen.

Ohne Docker für die App, nur für die Datenbank:

```bash
docker compose up -d db
npm install
DATABASE_URL=postgres://forest:forest@localhost:5432/forest npm start
```

> **Für die Kamera am Handy** brauchst du HTTPS — siehe [Am Handy testen](#am-handy-testen).
> Auf `localhost` am Rechner geht die Kamera auch ohne.

Tests (brauchen eine erreichbare Datenbank):

```bash
npm run db:test               # startet ein Postgres auf Port 55432
npm test
```

---

## Wie das Spiel funktioniert

### Pflanzplätze

Die Welt ist in ein Raster aus Zellen von je 22 m Kantenlänge unterteilt. Rund ein
Drittel dieser Zellen trägt einen Pflanzplatz. Welche das sind, wird aus den
Zellkoordinaten **berechnet**, nicht gespeichert — dadurch gibt es überall auf der
Erde Plätze, ohne dass irgendjemand sie vorher anlegen müsste. Derselbe Ort liefert
immer dasselbe Ergebnis, auf dem Server wie auf jedem Gerät.

In der Praxis liegt der nächste Platz im Median 16 m entfernt, in 90 % der Fälle
unter 31 m. Du musst also ein paar Schritte gehen, aber nie weit.

Jeder Platz hat einen Bodentyp, der bestimmt, was dort wächst:

| Boden | Anteil | Was wächst hier |
|---|---|---|
| karg | 50 % | Gänseblümchen |
| normal | 35 % | Gänseblümchen, Tulpe |
| fruchtbar | 15 % | alles, auch Sonnenblume und Rose |

### Pflanzen und Wachsen

| Blume | Reifezeit | Samen | Ertrag | XP |
|---|---|---|---|---|
| 🌼 Gänseblümchen | 1 Std. | 1 | 2 Samen, 5 Münzen | 10 |
| 🌷 Tulpe | 3 Std. | 1 | 2 Samen, 14 Münzen | 25 |
| 🌻 Sonnenblume | 8 Std. | 2 | 3 Samen, 45 Münzen | 70 |
| 🌹 Rose | 14 Std. | 3 | 3 Samen, 90 Münzen | 140 |

Pflanzen wachsen **nur, wenn sie Wasser haben**. Nach dem Gießen läuft die
Wachstumsuhr 2 Stunden lang; danach steht sie still, bis wieder gegossen wird —
erreichter Fortschritt geht dabei nie verloren. Eine Sonnenblume braucht deshalb
vier Besuche, eine Rose sieben. Nur das Gänseblümchen blüht schon vom Gießen beim
Pflanzen auf.

Nach 48 Stunden ohne Wasser verwelkt eine noch nicht aufgeblühte Pflanze. Aufgeräumt
werden darf sie dann von **jedem** — sonst würde eine verlassene Pflanze den Platz für
alle dauerhaft blockieren. Wer fremdes Verwelktes entfernt, bekommt 3 XP. Eine
aufgeblühte Blume verwelkt nicht; sie wartet auf ihren Besitzer.

Deine Gießkanne füllt sich von selbst auf: eine Einheit alle 10 Minuten.

### Miteinander statt gegeneinander

Fremde Pflanzen darfst du gießen — das gibt **8 XP pro Pflanze**, allerdings nur beim
ersten Mal, damit sich dieselbe Blume nicht endlos abmelken lässt. Ernten darf nur,
wer gepflanzt hat.

### Bauen

Dein **Gewächshaus** ist dein Hauptheim. Du setzt genau eines, dort wo du gerade
stehst, und es bildet die Mitte deines Grundstücks. Alles Weitere muss innerhalb von
120 m davon stehen, mit mindestens 15 m Abstand zwischen zwei Gebäuden.

| Gebäude | Kosten | Wirkung |
|---|---|---|
| 🏡 Gewächshaus | gratis | Hauptheim, genau eines pro Spieler |
| ⛲ Brunnen | 60 🪙 | Füllt die Gießkanne sofort, im Umkreis von 80 m |
| 🐝 Bienenstock | 150 🪙 | 25 % schnelleres Wachstum im Umkreis von 60 m, plus ein Samen bei der Ernte |
| 🛖 Schuppen | 100 🪙 | Gießkanne fasst 5 Einheiten mehr |

### Reichweite

Pflanzen, gießen, ernten und bauen geht nur bis **40 m** Entfernung. Diese Prüfung
läuft auf dem Server — der Client meldet nur seine Position und entscheidet nichts
selbst.

---

## Am Handy testen

Browser geben Kamera und Kompass nur über HTTPS frei (Ausnahme: `localhost`). Für den
Test im eigenen WLAN erzeugt das Projekt ein Zertifikat:

```bash
docker compose up -d db    # Datenbank, falls noch nicht gestartet
npm run cert               # einmalig, legt data/cert.pem und data/key.pem an
DATABASE_URL=postgres://forest:forest@localhost:5432/forest npm start
```

Der Server schaltet automatisch auf HTTPS um, sobald die Dateien da sind, und gibt die
Adresse aus. Am Handy dann `https://<deine-IP>:3000` öffnen und die Zertifikatswarnung
bestätigen — sie ist bei einem selbstsignierten Zertifikat normal.

**Auf dem Startbildschirm ablegen:** Safari → Teilen → „Zum Home-Bildschirm", Chrome →
Menü → „App installieren". Dann läuft Forest ohne Browserleiste im Vollbild.

### Wenn die AR-Ansicht leer bleibt

- **Kein Kompass?** Geh einmal in einer Acht herum — viele Geräte kalibrieren ihren
  Magnetsensor erst dadurch. Steht „(ungenau)" neben der Gradzahl, liefert das Gerät
  nur eine relative Drehung; die Karte richtet sich dann nach Norden aus.
- **iOS fragt nicht nach Bewegungsdaten?** Die Abfrage braucht eine echte Berührung.
  Tippe einmal auf den Bildschirm, dann kommt sie nach.
- **Drinnen?** GPS ist in Gebäuden oft auf 50 m genau oder schlechter. Die Anzeige
  oben links färbt sich dann gelb oder rot.

---

## Der kürzeste Weg: GitHub Pages

Ohne Server, ohne Konto, ohne Kosten. Der Arbeitsablauf
`.github/workflows/pages.yml` veröffentlicht bei jedem Push den Inhalt von
`public/`; die Adresse lautet dann `https://<konto>.github.io/<repo>/`.

Dort läuft die App im Offline-Betrieb: Der Garten liegt im Browser des Geräts und
bleibt dort, bis jemand die Browserdaten löscht. Gemeinsames Spielen geht so
nicht — dafür braucht es den Server unten.

Beides schließt sich nicht aus: Dieselbe Fassung läuft auf Pages offline und
hinter einem Server gemeinsam. Die Spielregeln liegen in `public/shared/` und
werden von beiden Seiten benutzt, damit eine Blume nicht je nach Betriebsart
unterschiedlich schnell wächst.

---

## Online stellen

Damit die App von überall erreichbar ist — und die Kamera ohne
Zertifikatswarnung funktioniert — muss sie irgendwo öffentlich laufen.

Der Container selbst speichert nichts. Alles Bleibende liegt in der Datenbank
hinter `DATABASE_URL`. Dadurch ist es egal, ob der Hoster den Container
zwischendurch wegwirft — genau das tun kostenlose Pläne nämlich.

### Schritt 1: Datenbank

Eine kostenlose PostgreSQL-Datenbank gibt es bei [neon.tech](https://neon.tech)
(Anmeldung mit GitHub, keine Zahlungsdaten). Projekt anlegen, dann die
angezeigte Verbindungszeichenfolge kopieren — sie sieht so aus:

```
postgres://benutzer:passwort@ep-irgendwas.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

Supabase oder jede andere Postgres-Instanz gehen genauso.

### Schritt 2a: Render — ohne Kommandozeile, geht auch vom Handy

**Voraussetzung:** Render nimmt den Standard-Branch des Repositorys. Der Code
muss also auf `main` liegen — vorher den Pull Request mergen.

Auf [render.com](https://render.com) mit dem GitHub-Konto anmelden,
„New → Blueprint", dieses Repository auswählen. Render fragt nach
`DATABASE_URL` — dort die Zeichenfolge aus Schritt 1 einsetzen — und richtet
den Rest selbst ein. Der erste Build dauert ein paar Minuten.

Der kostenlose Plan reicht. Er schläft nach 15 Minuten ohne Zugriff ein, der
erste Aufruf danach dauert etwa eine Minute. Verloren geht dabei nichts.

### Schritt 2b: Fly.io — über die Kommandozeile

```bash
fly launch --no-deploy --copy-config
fly secrets set DATABASE_URL='postgres://...'
fly secrets set JWT_SECRET=$(openssl rand -hex 32)
fly deploy
```

Fly bringt auch eine eigene Postgres-Instanz mit, dann entfällt Schritt 1:

```bash
fly postgres create --name forest-db
fly postgres attach forest-db      # setzt DATABASE_URL automatisch
```

### Schritt 2c: Eigener Server

```bash
docker build -t forest .
docker run -d -p 3000:3000 \
  -e DATABASE_URL='postgres://...' \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e NODE_ENV=production \
  forest
```

Davor gehört ein Reverse-Proxy mit TLS (Caddy oder nginx) — ohne HTTPS gibt
kein Browser die Kamera frei.

### Was das Image tut

- Node 22 auf Alpine, rund 250 MB, läuft als Benutzer `node` statt als root
- Legt das Datenbankschema beim Start selbst an
- `/api/health` als Health-Check, von Docker, Fly und Render gleichermaßen genutzt
- Beendet sich bei SIGTERM sauber und schließt die Verbindungen
- Speichert nichts im Dateisystem — der Container darf jederzeit verschwinden

`JWT_SECRET` ist optional: Ohne die Variable erzeugt der Server beim ersten
Start einen Schlüssel und legt ihn in der Datenbank ab. Ausdrücklich gesetzt
ist trotzdem übersichtlicher.

**Verschlüsselung zur Datenbank** richtet sich nach `sslmode` in der
Verbindungszeichenfolge. Fehlt der Parameter, entscheidet die Adresse:
Datenbanken im eigenen Netz unverschlüsselt, alles im Internet mit TLS.
`PGSSLMODE` überstimmt beides.

---

## Aufbau

```
server/
  index.js       HTTP-Server, Ratenbegrenzung, liefert die PWA aus
  geo.js         Weiterleitung auf public/shared/geo.js
  game.js        Weiterleitung auf public/shared/game.js
  db.js          Datenbankverbindung, Schema und Transaktionen
  auth.js        Registrierung, Login, Token-Prüfung
  player.js      Gießkanne, Inventar, XP
  routes/        auth · world · actions
public/
  index.html     Gerüst der Oberfläche
  app.js         Steuerung: wählt den Rückhalt, verbindet Sensoren und Anzeige
  shared/geo.js   Weltraster, Entfernungen, Peilungen — von Server und Browser genutzt
  shared/game.js  Arten, Wachstum, Gebäude, Weltgenerierung — ebenso
  js/sensors.js  GPS und Kompass (die Plattformunterschiede stecken hier)
  js/ar.js       Kamerabild und Überlagerung
  js/map.js      Minikarte auf Canvas
  js/ui.js       Blätter, Karten, Hinweise
  js/api.js      Serveranbindung
  js/local.js    Derselbe Funktionsumfang ohne Server, im Browser gerechnet
  sw.js          Service Worker fürs Zwischenspeichern der Oberfläche
test/
  api.test.js    Integrationstests gegen die echte API

.github/workflows/ Tests bei jedem Push, Veröffentlichung auf GitHub Pages
Dockerfile         Betriebs-Image (Node 22 auf Alpine, läuft als Nicht-Root)
docker-compose.yml Datenbank und App für die lokale Entwicklung
fly.toml           Fly.io
render.yaml        Render-Blueprint
```

### Warum so

**Alle Spielentscheidungen fallen auf dem Server.** Der Client schickt seine
Koordinaten und bekommt zurück, was er anzeigen darf. Entfernung, Bodentyp, Kosten und
Besitz werden serverseitig geprüft — sonst könnte man sich per Browser-Konsole eine
Rose ins Wohnzimmer pflanzen.

**Kein Build-Schritt.** Das Frontend besteht aus ES-Modulen, die der Browser direkt
lädt. Keine Bundler-Konfiguration, kein Kompilieren, kein Übersetzungslauf vor dem
Start — geändertes Frontend heißt: Seite neu laden.

**PostgreSQL, nicht SQLite.** Angefangen hatte das Projekt mit einer
SQLite-Datei — bequem, aber sie lebt im Dateisystem des Containers, und das ist
auf kostenlosen Hostern flüchtig: Nach jedem Einschlafen wäre die Welt leer
gewesen. Mit einer Datenbank außerhalb überlebt sie das.

Der Umstieg hat noch etwas anderes gebracht: Regeln wie „auf einem Platz wächst
nur eine Pflanze" und „ein Gewächshaus pro Spieler" stehen jetzt als eindeutige
Indizes in der Datenbank statt als Abfrage im Code davor. Bei zwei gleichzeitigen
Anfragen gewinnt dadurch genau eine — vorher hätten beide durchgehen können.

**Eine App, zwei Betriebsarten.** Beim Start fragt die App einmal `api/health`
ab. Antwortet etwas, benutzt sie den Server; antwortet nichts, den Offline-Weg.
Beide bieten dieselben Aufrufe an, deshalb merkt der Rest der Steuerung vom
Unterschied nichts — und es gibt keinen Schalter, den man falsch stellen kann.

### Die Blickrichtung

Das ist der Teil, der auf den beiden Plattformen unterschiedlich funktioniert:

- **iOS** liefert mit `webkitCompassHeading` direkt den Kompassgrad.
- **Android** liefert nur Eulerwinkel. Der naheliegende Wert `alpha` stimmt aber nur,
  solange das Gerät flach liegt — beim Hochhalten, also genau in der AR-Haltung,
  kippt er weg. Deshalb wird die Richtung aus allen drei Winkeln über die
  Richtungsvektoren berechnet (`headingFromEuler` in `public/js/sensors.js`).

Dazu kommt die Bildschirmdrehung, damit es im Querformat ebenfalls stimmt.

---

## Einstellungen

Alles optional, siehe `.env.example`:

| Variable | Standard | Bedeutung |
|---|---|---|
| `DATABASE_URL` | — | **Pflicht.** Verbindung zur PostgreSQL-Datenbank |
| `PORT` | `3000` | Port des Servers |
| `JWT_SECRET` | wird erzeugt | Schlüssel für Anmelde-Tokens |
| `PGSSLMODE` | aus der URL | Überstimmt die Verschlüsselungsentscheidung |
| `DB_POOL_MAX` | `10` | Gleichzeitige Datenbankverbindungen |
| `WORLD_SEED` | `forest-v1` | Formt die gesamte Welt — ein anderer Wert verteilt alle Pflanzplätze neu |

---

## Was noch fehlt

Das Spiel ist vollständig spielbar, aber ein paar Dinge lohnen sich als Nächstes:

- **Jahreszeiten und Wetter** — bei Regen bräuchte man nicht zu gießen.
- **Nachbarschaften**: Wer viel im selben Viertel pflanzt, könnte gemeinsame Ziele
  bekommen.
- **Mehr Sorten**, etwa seltene Blumen, die nur zu bestimmten Tageszeiten aufgehen.
- **Betrieb**: Für echten Mehrspielerbetrieb gehören Ratenbegrenzung und
  TLS-Terminierung vor den Prozess (nginx, Caddy). Die Weltabfrage filtert
  Pflanzen und Gebäude noch über ein Koordinatenfenster; bei vielen Spielern
  lohnt sich PostGIS oder ein Index auf der Rasterzelle.
- **Plausibilitätsprüfung der Position**: Aktuell wird die Entfernung geprüft, aber
  nicht, wie schnell sich jemand bewegt. Wer seinen Standort fälscht, kann
  weiterspringen, als er laufen könnte.
