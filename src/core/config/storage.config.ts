import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  provider: process.env.STORAGE_PROVIDER || 'local', // 'local', 's3', 'azure'
  
  local: {
    path: process.env.STORAGE_LOCAL_PATH || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || (50 * 1024 * 1024).toString(), 10), // 50MB
  },
  
  s3: {
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION,
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  
  encryption: {
    enabled: process.env.FILE_ENCRYPTION_ENABLED === 'true',
    algorithm: 'aes-256-gcm',
  },
  
  retention: {
    tempFiles: 24 * 60 * 60 * 1000, // 24 heures
    deletedFiles: 30 * 24 * 60 * 60 * 1000, // 30 jours
  },
}));