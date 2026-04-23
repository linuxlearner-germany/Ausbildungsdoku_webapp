# Lokal starten

Diese Datei wurde auf den aktuellen MSSQL-/Redis-Only-Stand gebracht.

Der empfohlene Weg ist:

```bash
npm install
cp .env.example .env
npm run infra:up
npm run db:migrate
npm run db:bootstrap
npm run dev
```

Weitere Details stehen in [docs/LOCAL_DEVELOPMENT.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/LOCAL_DEVELOPMENT.md).
