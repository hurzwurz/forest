# Forest -- AR-Gartenspiel
#
# Node 22 ist Pflicht: Die Datenbank läuft über das eingebaute node:sqlite,
# das es erst ab 22.5 gibt. Dadurch braucht das Image keinen Compiler und
# keine Datenbank daneben.

FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=3000
# Zeigt im Betrieb auf ein eingehängtes Laufwerk -- siehe fly.toml.
ENV DB_FILE=/data/forest.db

WORKDIR /app

# Abhängigkeiten zuerst: Diese Ebene wird zwischengespeichert und nur neu
# gebaut, wenn sich package-lock.json ändert.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server/ ./server/
COPY public/ ./public/

# Nicht als root laufen. Das Node-Image bringt den Benutzer `node` mit.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3000

# Die Laufzeitumgebung beendet TLS selbst; der Prozess spricht einfaches HTTP.
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server/index.js"]
