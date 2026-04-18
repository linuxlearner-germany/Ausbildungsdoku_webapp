function nowIso() {
  return new Date().toISOString();
}

export function createSeedStore() {
  const createdAt = nowIso();
  return {
    sessionUserId: null,
    nextUserId: 6,
    nextGradeId: 7,
    nextAuditId: 5,
    educations: [
      { id: 1, name: "Fachinformatiker Systemintegration" },
      { id: 2, name: "Fachinformatiker Anwendungsentwicklung" }
    ],
    users: [
      {
        id: 1,
        name: "Admin Demo",
        username: "admin",
        email: "admin@demo.local",
        password: "Admin!12345",
        role: "admin",
        ausbildung: "",
        betrieb: "WIWEB",
        berufsschule: "",
        trainerIds: [],
        themePreference: "system"
      },
      {
        id: 2,
        name: "Sabine Ausbilder",
        username: "trainer",
        email: "trainer@demo.local",
        password: "Trainer!12345",
        role: "trainer",
        ausbildung: "",
        betrieb: "WIWEB",
        berufsschule: "",
        trainerIds: [],
        themePreference: "system"
      },
      {
        id: 3,
        name: "Max Mustermann",
        username: "azubi",
        email: "azubi@demo.local",
        password: "Azubi!12345",
        role: "trainee",
        ausbildung: "Fachinformatiker Systemintegration",
        betrieb: "WIWEB",
        berufsschule: "BSZ Musterstadt",
        trainerIds: [2],
        themePreference: "system"
      },
      {
        id: 4,
        name: "Erika Beispiel",
        username: "azubi2",
        email: "azubi2@demo.local",
        password: "Azubi!12345",
        role: "trainee",
        ausbildung: "Fachinformatiker Anwendungsentwicklung",
        betrieb: "WIWEB",
        berufsschule: "BSZ Musterstadt",
        trainerIds: [2],
        themePreference: "system"
      },
      {
        id: 5,
        name: "Tom Trainer",
        username: "trainer2",
        email: "trainer2@demo.local",
        password: "Trainer!12345",
        role: "trainer",
        ausbildung: "",
        betrieb: "WIWEB",
        berufsschule: "",
        trainerIds: [],
        themePreference: "system"
      }
    ],
    entries: [
      {
        id: "entry-2026-04-14-max",
        traineeId: 3,
        weekLabel: "Serverwartung und Ticketbearbeitung",
        dateFrom: "2026-04-14",
        dateTo: "2026-04-14",
        betrieb: "Windows-Clients aktualisiert und Störungen im Ticketsystem dokumentiert.",
        schule: "",
        status: "signed",
        signedAt: createdAt,
        signerName: "Sabine Ausbilder",
        trainerComment: "Sauber dokumentiert.",
        rejectionReason: ""
      },
      {
        id: "entry-2026-04-15-max",
        traineeId: 3,
        weekLabel: "Netzwerkdokumentation",
        dateFrom: "2026-04-15",
        dateTo: "2026-04-15",
        betrieb: "Switch-Port-Belegung geprüft und Dokumentation ergänzt.",
        schule: "",
        status: "submitted",
        signedAt: null,
        signerName: "",
        trainerComment: "",
        rejectionReason: ""
      },
      {
        id: "entry-2026-04-16-max",
        traineeId: 3,
        weekLabel: "Berufsschultag Datenbanken",
        dateFrom: "2026-04-16",
        dateTo: "2026-04-16",
        betrieb: "",
        schule: "Normalisierung, SQL-Joins und kurze Übungsabfrage behandelt.",
        status: "draft",
        signedAt: null,
        signerName: "",
        trainerComment: "",
        rejectionReason: ""
      },
      {
        id: "entry-2026-04-11-erika",
        traineeId: 4,
        weekLabel: "React-Komponenten überarbeitet",
        dateFrom: "2026-04-11",
        dateTo: "2026-04-11",
        betrieb: "UI-States für Formulare vereinheitlicht und Fehlermeldungen verbessert.",
        schule: "",
        status: "submitted",
        signedAt: null,
        signerName: "",
        trainerComment: "",
        rejectionReason: ""
      },
      {
        id: "entry-2026-04-10-erika",
        traineeId: 4,
        weekLabel: "API-Dokumentation geschrieben",
        dateFrom: "2026-04-10",
        dateTo: "2026-04-10",
        betrieb: "Swagger-Endpunkte ergänzt und Response-Beispiele nachgezogen.",
        schule: "",
        status: "rejected",
        signedAt: null,
        signerName: "",
        trainerComment: "Bitte genauer beschreiben, welche Endpunkte geändert wurden.",
        rejectionReason: "Beschreibung zu allgemein."
      }
    ],
    grades: [
      { id: 1, traineeId: 3, fach: "Netzwerktechnik", typ: "Schulaufgabe", bezeichnung: "Subnetting", datum: "2026-03-10", note: 2, gewicht: 2 },
      { id: 2, traineeId: 3, fach: "Deutsch", typ: "Stegreifaufgabe", bezeichnung: "Protokoll", datum: "2026-03-18", note: 2.5, gewicht: 1 },
      { id: 3, traineeId: 3, fach: "Wirtschaft", typ: "Schulaufgabe", bezeichnung: "Rechtsformen", datum: "2026-03-24", note: 3, gewicht: 2 },
      { id: 4, traineeId: 4, fach: "Programmierung", typ: "Schulaufgabe", bezeichnung: "React Routing", datum: "2026-03-11", note: 1.5, gewicht: 2 },
      { id: 5, traineeId: 4, fach: "Datenbanken", typ: "Stegreifaufgabe", bezeichnung: "SQL Basics", datum: "2026-03-20", note: 2, gewicht: 1 },
      { id: 6, traineeId: 4, fach: "Programmierung", typ: "Stegreifaufgabe", bezeichnung: "Hooks", datum: "2026-03-28", note: 2, gewicht: 1 }
    ],
    auditLogs: [
      {
        id: 1,
        createdAt,
        actorUserId: 1,
        actorName: "Admin Demo",
        actorRole: "admin",
        actionType: "USER_CREATED",
        entityType: "user",
        entityId: "5",
        targetUserId: 5,
        summary: "Tom Trainer wurde als zusätzlicher Ausbilder angelegt.",
        changes: null,
        metadata: { username: "trainer2", role: "trainer" }
      },
      {
        id: 2,
        createdAt,
        actorUserId: 3,
        actorName: "Max Mustermann",
        actorRole: "trainee",
        actionType: "REPORT_SUBMITTED",
        entityType: "entry",
        entityId: "entry-2026-04-15-max",
        targetUserId: 3,
        summary: "Ein Tagesbericht wurde zur Freigabe eingereicht.",
        changes: null,
        metadata: { traineeName: "Max Mustermann" }
      },
      {
        id: 3,
        createdAt,
        actorUserId: 2,
        actorName: "Sabine Ausbilder",
        actorRole: "trainer",
        actionType: "REPORT_SIGNED",
        entityType: "entry",
        entityId: "entry-2026-04-14-max",
        targetUserId: 3,
        summary: "Ein Tagesbericht wurde freigegeben.",
        changes: null,
        metadata: { traineeName: "Max Mustermann" }
      },
      {
        id: 4,
        createdAt,
        actorUserId: 1,
        actorName: "Admin Demo",
        actorRole: "admin",
        actionType: "CSV_IMPORT_EXECUTED",
        entityType: "user_import",
        entityId: "demo-import",
        targetUserId: null,
        summary: "Demo-Import für die GitHub-Pages-Version vorbereitet.",
        changes: null,
        metadata: { importedCount: 2 }
      }
    ]
  };
}
