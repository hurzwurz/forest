#!/usr/bin/env bash
# Erzeugt ein selbstsigniertes Zertifikat für den Test im eigenen WLAN.
# Der Browser gibt Kamera und Kompass nur über HTTPS (oder localhost) frei.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p data

# Lokale IP ermitteln, damit das Zertifikat auch für den Handy-Zugriff passt.
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
IP="${IP:-127.0.0.1}"

openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout data/key.pem -out data/cert.pem \
  -subj "/CN=$IP" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$IP" 2>/dev/null

chmod 600 data/key.pem
echo "Zertifikat erstellt für $IP"
echo "Server starten mit: npm start"
echo "Am Handy öffnen:    https://$IP:${PORT:-3000}"
echo "(Der Browser warnt vor dem selbstsignierten Zertifikat — das ist hier erwartet.)"
