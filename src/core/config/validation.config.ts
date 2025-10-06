import { registerAs } from '@nestjs/config';

export default registerAs('validation', () => ({
  // Règles de validation métier
  dossier: {
    minClientInfo: ['firstName', 'lastName', 'email'],
    requiredFields: ['clientId', 'avocatId', 'procedureTypeId', 'juridiction'],
    statusTransitions: {
      allowed: {
        'ouvert': ['amiable', 'contentieux'],
        'amiable': ['contentieux', 'cloture'],
        'contentieux': ['decision', 'cloture'],
        'decision': ['recours', 'cloture'],
        'recours': ['decision', 'cloture'],
        'cloture': ['archive'],
      },
    },
  },
  
  document: {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedMimeTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ],
    maxFilenameLength: 255,
  },
  
  audience: {
    minReminderHours: 48,
    maxFutureDays: 365, // 1 an maximum
  },
}));