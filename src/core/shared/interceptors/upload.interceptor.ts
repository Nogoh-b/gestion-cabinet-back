// src/common/interceptors/upload.interceptor.ts
import { diskStorage, memoryStorage } from 'multer';
import { join, extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomBytes } from 'crypto';

/**
 * Whitelist des extensions autorisées pour les uploads de documents.
 * Refuse par défaut tout ce qui est exécutable/interprétable côté serveur ou
 * navigateur (php, html, svg, js, exe...) pour éviter RCE, XSS et sniffing.
 * Ajuster selon les besoins métier du cabinet juridique.
 */
const ALLOWED_EXTENSIONS = new Set([
  // Documents
  '.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt', '.csv', '.xls', '.xlsx',
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff',
  // Audio/vidéo (preuves, audition)
  '.mp3', '.wav', '.mp4', '.mov',
]);

/** Mapping extension → types MIME attendus (vérification du contenu réel). */
const EXTENSION_MIME: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.gif': ['image/gif'],
  '.webp': ['image/webp'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  '.zip': ['application/zip'],
};

/**
 * Vérifie qu'un fichier est autorisé (extension + MIME déclaré par le client).
 * La vérification du contenu réel via file-type se fait dans le service
 * (au moment où tout le buffer est disponible), car multer peut recevoir le
 * flux par morceaux.
 */
export function isAllowedFile(originalname: string, mimetype: string): boolean {
  const ext = extname(originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) return false;

  const expected = EXTENSION_MIME[ext];
  if (expected && !expected.includes(mimetype)) return false;

  return true;
}

/** Filtre multer : rejette immédiatement les fichiers non autorisés. */
export const fileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (isAllowedFile(file.originalname, file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Type de fichier non autorisé : ${file.originalname} (${file.mimetype}). ` +
          `Extensions acceptées : PDF, DOC/DOCX, XLS/XLSX, images courantes.`,
      ),
      false,
    );
  }
};

export const multerOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      // dossier fixe hors de dist/
      const upload_path = join(process.cwd(), 'uploads');
      if (!existsSync(upload_path)) {
        mkdirSync(upload_path, { recursive: true });
      }
      cb(null, upload_path);
    },
    filename: (_req, file, cb) => {
      // Nom unique cryptographiquement aléatoire + extension CONTRÔLÉE serveur.
      // On ne réutilise JAMAIS l'extension fournie par le client sans validation.
      const ext = extname(file.originalname).toLowerCase();
      const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : '';
      const random_name = randomBytes(16).toString('hex');
      cb(null, `${random_name}${safeExt}`);
    },
  }),
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 Mo
  },
};

/**
 * Storage mémoire pour traitement immédiat (ex: IA).
 * Limité à 10 Mo pour limiter le risque d'OOM (le buffer entier est en RAM).
 */
export const memoryStorageOptions = {
  storage: memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 Mo — plus strict en mémoire
  },
};
