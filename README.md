# 🌱 Forest

Pflanze Blumen an echten Orten und sieh sie durch die Kamera deines Handys wachsen.

Forest funktioniert wie Pokémon Go, nur mit Garten statt Monstern: Du siehst die
echte Welt durch die Kamera, darüber liegen die Pflanzplätze in deiner Umgebung.
Was du pflanzt, bleibt an diesem Ort liegen — und andere Spieler sehen es auch.

---

## Schnellstart

```bash
npm install
npm start
```

Dann <http://localhost:3000> im Browser öffnen.

> **Für die Kamera am Handy** brauchst du HTTPS — siehe [Am Handy testen](#am-handy-testen).
> Auf `localhost` am Rechner geht die Kamera auch ohne.

Tests:

```bash
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
npm run cert     # einmalig, legt data/cert.pem und data/key.pem an
npm start
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

## Online stellen

Damit die App von überall erreichbar ist — und die Kamera ohne
Zertifikatswarnung funktioniert — muss sie irgendwo öffentlich laufen. Das
Projekt bringt alles Nötige mit: `Dockerfile`, `fly.toml` und `render.yaml`.

**Wichtig bei jedem Anbieter:** Die Welt liegt in einer SQLite-Datei. Ohne ein
dauerhaftes Laufwerk unter `/data` sind Konten und Pflanzen nach jedem Ausrollen
verschwunden.

### Fly.io — empfohlen

Der einzige der beiden Wege mit dauerhaftem Laufwerk im kostenlosen Rahmen.
Braucht die Kommandozeile:

```bash
fly launch --no-deploy --copy-config     # nimmt die mitgelieferte fly.toml
fly volumes create forest_data --size 1  # 1 GB reichen für sehr viele Gärten
fly secrets set JWT_SECRET=$(openssl rand -hex 32)
fly deploy
```

Danach steht die App unter `https://<app-name>.fly.dev`. HTTPS macht Fly selbst,
also nichts mit Zertifikaten zu tun.

Den App-Namen in `fly.toml` vorher auf etwas Freies ändern — `forest-ar` ist
vermutlich vergeben. Region `fra` ist Frankfurt; `fly platform regions` zeigt
die Alternativen.

### Render — ohne Kommandozeile, geht auch vom Handy

Auf [render.com](https://render.com) anmelden, „New → Blueprint", GitHub-Konto
verbinden, dieses Repository auswählen. Render liest `render.yaml` und richtet
alles selbst ein.

Der Haken: Das dort konfigurierte Laufwerk ist bei Render kostenpflichtig. Auf
dem kostenlosen Plan läuft die App zwar, aber jeder Neustart setzt die Welt
zurück — zum Anschauen in Ordnung, zum Spielen nicht.

### Irgendein eigener Server

```bash
docker build -t forest .
docker run -d -p 3000:3000 \
  -v forest_data:/data \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e NODE_ENV=production \
  forest
```

Davor gehört ein Reverse-Proxy mit TLS (Caddy oder nginx) — ohne HTTPS gibt
kein Browser die Kamera frei.

### Was das Image tut

- Node 22 auf Alpine, rund 250 MB, läuft als Benutzer `node` statt als root
- `/api/health` als Health-Check, von Docker, Fly und Render gleichermaßen genutzt
- Beendet sich bei SIGTERM sauber und schließt die Datenbank, damit beim
  Ausrollen kein offenes WAL-Journal zurückbleibt
- Erwartet die Weltdatenbank unter `/data/forest.db`; dorthin gehört das
  dauerhafte Laufwerk

Setz `JWT_SECRET` immer ausdrücklich. Ohne die Variable erzeugt der Server sich
selbst einen Schlüssel und legt ihn neben der Datenbank ab — das geht gut,
solange das Laufwerk bleibt, aber ein gesetztes Geheimnis ist eindeutiger.

---

## Aufbau

```
server/
  index.js       HTTP-Server, Ratenbegrenzung, liefert die PWA aus
  geo.js         Weltraster, Entfernungen, Peilungen
  game.js        Arten, Wachstum, Gebäude, Weltgenerierung
  db.js          SQLite-Schema (über das in Node eingebaute node:sqlite)
  auth.js        Registrierung, Login, Token-Prüfung
  player.js      Gießkanne, Inventar, XP
  routes/        auth · world · actions
public/
  index.html     Gerüst der Oberfläche
  app.js         Steuerung: verbindet Sensoren, Server und Anzeige
  js/sensors.js  GPS und Kompass (die Plattformunterschiede stecken hier)
  js/ar.js       Kamerabild und Überlagerung
  js/map.js      Minikarte auf Canvas
  js/ui.js       Blätter, Karten, Hinweise
  js/api.js      Serveranbindung
  sw.js          Service Worker für den Offline-Betrieb
test/
  api.test.js    Integrationstests gegen die echte API

Dockerfile       Betriebs-Image (Node 22 auf Alpine, läuft als Nicht-Root)
fly.toml         Fly.io samt dauerhaftem Laufwerk
render.yaml      Render-Blueprint
```

### Warum so

**Alle Spielentscheidungen fallen auf dem Server.** Der Client schickt seine
Koordinaten und bekommt zurück, was er anzeigen darf. Entfernung, Bodentyp, Kosten und
Besitz werden serverseitig geprüft — sonst könnte man sich per Browser-Konsole eine
Rose ins Wohnzimmer pflanzen.

**Kein Build-Schritt.** Das Frontend besteht aus ES-Modulen, die der Browser direkt
lädt. Keine Bundler-Konfiguration, kein Kompilieren — `npm start` genügt.

**SQLite über `node:sqlite`.** In Node ab 22.5 eingebaut, also kein nativer Build und
keine Datenbank, die separat laufen müsste. Die ganze Welt liegt in `data/forest.db`.

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
| `PORT` | `3000` | Port des Servers |
| `DB_FILE` | `data/forest.db` | Pfad zur Weltdatenbank |
| `JWT_SECRET` | wird erzeugt | Schlüssel für Anmelde-Tokens |
| `WORLD_SEED` | `forest-v1` | Formt die gesamte Welt — ein anderer Wert verteilt alle Pflanzplätze neu |

---

## Was noch fehlt

Das Spiel ist vollständig spielbar, aber ein paar Dinge lohnen sich als Nächstes:

- **Jahreszeiten und Wetter** — bei Regen bräuchte man nicht zu gießen.
- **Nachbarschaften**: Wer viel im selben Viertel pflanzt, könnte gemeinsame Ziele
  bekommen.
- **Mehr Sorten**, etwa seltene Blumen, die nur zu bestimmten Tageszeiten aufgehen.
- **Betrieb**: Für echten Mehrspielerbetrieb gehören Ratenbegrenzung und
  TLS-Terminierung vor den Prozess (nginx, Caddy), und die Datenbank auf ein
  gesichertes Laufwerk. Bei mehr als ein paar hundert gleichzeitigen Spielern wird
  aus SQLite sinnvollerweise PostgreSQL — die Abfragen sind bewusst einfach gehalten,
  damit der Wechsel leichtfällt.
- **Plausibilitätsprüfung der Position**: Aktuell wird die Entfernung geprüft, aber
  nicht, wie schnell sich jemand bewegt. Wer seinen Standort fälscht, kann
  weiterspringen, als er laufen könnte.
