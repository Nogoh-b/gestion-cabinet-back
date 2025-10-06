export const SYSTEM_CONSTANTS = {
  PAGINATION: {
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
  },
  
  SEARCH: {
    MAX_RESULTS: 1000,
    TIMEOUT_MS: 2000,
  },
  
  SECURITY: {
    PASSWORD_MIN_LENGTH: 8,
    SALT_ROUNDS: 12,
  },
  
  FILES: {
    UPLOAD_PATH: './uploads',
    MAX_FILES_PER_UPLOAD: 10,
  },
} as const;