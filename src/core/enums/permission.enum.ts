export enum Permission {
  // Dossiers
  DOSSIER_CREATE = 'dossier:create',
  DOSSIER_READ = 'dossier:read',
  DOSSIER_UPDATE = 'dossier:update',
  DOSSIER_DELETE = 'dossier:delete',
  
  // Documents
  DOCUMENT_UPLOAD = 'document:upload',
  DOCUMENT_DOWNLOAD = 'document:download',
  
  // Clients
  CLIENT_READ = 'client:read',
  CLIENT_UPDATE = 'client:update',
  
  // Administration
  USER_MANAGE = 'user:manage',
  SYSTEM_CONFIG = 'system:config',
}