import { registerAs } from '@nestjs/config';

export default registerAs('notification', () => ({
  // Configuration des rappels d'audience
  audienceReminders: {
    enabled: process.env.AUDIENCE_REMINDERS_ENABLED !== 'false',
    defaultDelays: [168, 48, 24], // heures avant l'audience (7j, 48h, 24h)
  },
  
  // Notifications internes
  internal: {
    enabled: process.env.INTERNAL_NOTIFICATIONS_ENABLED !== 'false',
    webhookUrl: process.env.INTERNAL_WEBHOOK_URL,
  },
  
  // Notifications clients
  client: {
    enabled: process.env.CLIENT_NOTIFICATIONS_ENABLED !== 'false',
    methods: ['email'], // 'email', 'sms', 'push'
  },
  
  // Templates
  templates: {
    basePath: process.env.NOTIFICATION_TEMPLATES_PATH || './templates',
  },
}));