import { ConfigService } from "@nestjs/config";

const configService = new ConfigService();

// Durées de validité par défaut (en heures)
const RESET_PASSWORD_VALIDITY = 24; // 24 heures
const ACTIVATION_VALIDITY = 48; // 48 heures

export const helpers = {
  companyName: () => configService.get('COMPANY_NAME'),
  logoUrl: () => configService.get('COMPANY_LOGO_URL'),
  companyAddress: () => configService.get('COMPANY_ADDRESS'),
  companyEmail: () => configService.get('COMPANY_EMAIL'),
  companyPhone: () => configService.get('COMPANY_PHONE'),
  currentYear: () => new Date().getFullYear().toString(),
  appUrl: () => configService.get('APP_URL'),

  // Helpers pour les liens - utilisent le token passé dans le contexte
  resetPasswordLink: (token: string) => 
    `${configService.get('APP_URL')}/reset-password?token=${token}`,
  
  activationLink: (token: string) => 
    `${configService.get('APP_URL')}/auth/activate?token=${token}`,
  
  loginLink: () => `${configService.get('APP_URL')}/login`,

  // Helper qui calcule automatiquement la date d'expiration pour reset password
  resetPasswordExpiration: () => {
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + RESET_PASSWORD_VALIDITY);
    return expirationDate.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  // Helper qui calcule automatiquement la date d'expiration pour activation
  activationExpiration: () => {
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + ACTIVATION_VALIDITY);
    return expirationDate.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  // Heures restantes pour reset password
  resetPasswordHoursRemaining: () => RESET_PASSWORD_VALIDITY,

  // Heures restantes pour activation
  activationHoursRemaining: () => ACTIVATION_VALIDITY,

  // Date de la demande formatée
  requestDate: () => {
    return new Date().toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  join: (array) => {
    if (!array) return '';
    return array ? array.join(', ') : '';
  },

  formatDate: (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  },

  formatDateTime: (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  eq: (a, b) => a === b,
  contains: (str, substr) => str && str.includes(substr),
};