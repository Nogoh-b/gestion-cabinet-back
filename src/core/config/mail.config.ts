import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
  host: process.env.MAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.MAIL_PORT || '587', 10),
  secure: process.env.MAIL_SECURE === 'true',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASSWORD,
  },
  from: {
    name: process.env.MAIL_FROM_NAME || 'Système Juridique',
    address: process.env.MAIL_FROM_ADDRESS || 'noreply@juridique.com',
  },
  templates: {
    audienceReminder: 'audience-reminder',
    documentUpload: 'document-upload',
    factureReady: 'facture-ready',
  },
}));