export const BUSINESS_RULES = {
  // Règles métier du système
  DOSSIER: {
    REQUIRED_FIELDS: ['client', 'avocat', 'juridiction', 'procedureType'],
    MIN_CLIENT_INFO: ['firstName', 'lastName', 'email'],
  },
  
  AUDIENCE: {
    MIN_REMINDER_HOURS: 48,
    DEFAULT_REMINDERS: [168, 48], // 7 jours, 48 heures
  },
  
  DOCUMENT: {
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    ALLOWED_MIME_TYPES: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]  as string[],
  },
  
  FINANCE: {
    AUTO_ARCHIVE_DAYS: 30,
  },
} as const;