import { registerAs } from '@nestjs/config';

export default registerAs('features', () => ({
  // Modules activés/désactivés
  modules: {
    finances: process.env.FEATURE_FINANCES !== 'false',
    archive: process.env.FEATURE_ARCHIVE !== 'false',
    collaboration: process.env.FEATURE_COLLABORATION !== 'false',
    reporting: process.env.FEATURE_REPORTING !== 'false',
    mfa: process.env.FEATURE_MFA === 'true',
  },
  
  // Fonctionnalités spécifiques
  features: {
    autoArchive: process.env.FEATURE_AUTO_ARCHIVE === 'true',
    documentVersioning: process.env.FEATURE_DOCUMENT_VERSIONING !== 'false',
    audienceReminders: process.env.FEATURE_AUDIENCE_REMINDERS !== 'false',
    clientPortal: process.env.FEATURE_CLIENT_PORTAL === 'true',
    electronicSignature: process.env.FEATURE_ELECTRONIC_SIGNATURE === 'true',
  },
  
  // Limites système
  limits: {
    maxDossiersPerUser: parseInt(process.env.MAX_DOSSIERS_PER_USER || '1000', 10),
    maxDocumentsPerDossier: parseInt(process.env.MAX_DOCUMENTS_PER_DOSSIER || '500', 10),
    maxClientsPerAvocat: parseInt(process.env.MAX_CLIENTS_PER_AVOCAT || '500', 10),
  },
}));