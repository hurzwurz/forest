# Forest -- AR-Gartenspiel
#
# Der Container selbst speichert nichts: Die Welt liegt in einer
# PostgreSQL-Datenbank außerhalb, angegeben über DATABASE_URL. Dadurch ist es
# egal, ob der Hoster den Container zwischendurch wegwirft.

FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Abhängigkeiten zuerst: Diese Ebene wird zwischengespeichert und nur neu
# gebaut, wenn sich package-lock.json ändert.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server/ ./server/
COPY public/ ./public/

# Nicht als root laufen. Das Node-Image bringt den Benutzer `node` mit.
USER node

EXPOSE 3000

# Die Laufzeitumgebung beendet TLS selbst; der Prozess spricht einfaches HTTP.
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server/index.js"]
