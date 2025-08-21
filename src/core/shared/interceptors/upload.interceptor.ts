// src/common/interceptors/upload.interceptor.ts
import { diskStorage } from 'multer';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

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
      // génération d’un nom unique en snake_case
      const random_name = Array(16)
        .fill(null)
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join('');
      const ext = file.originalname.split('.').pop();
      cb(null, `${random_name}.${ext}`);
    },
  }),
};
