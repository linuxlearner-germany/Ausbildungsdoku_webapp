# Lokal starten

## Voraussetzungen

- Node.js installiert
- `npm` installiert

## Projekt lokal starten

1. Terminal im Projektordner oeffnen:

```bash
cd /home/paul/WIWEB_CLOUD/berichtsheft_webapp
```

2. Falls noetig, Abhaengigkeiten installieren:

```bash
npm install
```

3. Anwendung starten:

```bash
npm start
```

## Alternative fuer Entwicklung

Wenn du die App ohne vorherigen Produktions-Build starten willst:

```bash
npm run dev
```

## Aufruf im Browser

Danach im Browser oeffnen:

```text
http://localhost:3000
```

## Hinweise

- Die App nutzt lokal SQLite ueber den Ordner `data/`.
- Wenn `npm start` genutzt wird, wird vorher das Frontend gebaut.
- Wenn der Port belegt ist, pruefe die `PORT`-Angabe in deiner `.env`.
