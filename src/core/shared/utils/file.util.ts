import { createWriteStream } from 'fs';
import { join } from 'path';
import * as sharp from 'sharp';
import { BUSINESS_RULES } from '../interfaces/business-rules.constants';

export class FilesUtil {
  /**
   * Upload un fichier avec compression optionnelle pour les images
   * @returns {Promise<{fileName: string, fileSize: number}>} Nom du fichier et taille en octets
   */
  static async uploadFile(
    file: Express.Multer.File,
    FILE_PATH: string,
    mimetype,
    options?: { 
      maxSizeKB?: number;
      width?: number;
      quality?: number;
    }
  ): Promise<{fileName: string, fileSize: number}> {
    const fileName = `${Date.now()}-${file.originalname}`;
    const filePath = join(FILE_PATH, fileName);
    let finalSize: number;

    if (file.mimetype.startsWith(mimetype)) {
      // Traitement des images avec compression
      let outputBuffer = file.buffer;

      if (options?.maxSizeKB) {
        outputBuffer = await this.compressToMaxSize(
          file.buffer,
          options.maxSizeKB * 1024
        );
      } else if (options?.quality || options?.width) {
        outputBuffer = await sharp(file.buffer)
          .resize(options?.width)
          .jpeg({ quality: options?.quality })
          .png({ quality: options?.quality })
          .toBuffer();
      }

      finalSize = outputBuffer.length;
      await sharp(outputBuffer).toFile(filePath);
    } else {
      // Traitement des fichiers non-images
      finalSize = file.size;
      await new Promise<void>((resolve, reject) => {
        const stream = createWriteStream(filePath);
        stream.on('finish', () => resolve());
        stream.on('error', (err) => reject(err));
        stream.end(file.buffer);
      });
    }

    return {
      fileName,
      fileSize: finalSize
    };
  }

  /**
   * Méthode pour obtenir seulement la taille d'un fichier après traitement
   * (Utile si vous voulez une méthode dédiée)
   */
  static async getFileSize(
    file: Express.Multer.File,
    options?: { 
      maxSizeKB?: number;
      quality?: number;
    }
  ): Promise<number> {
    if (!file.mimetype.startsWith('image/') || !options) {
      return file.size;
    }

    const compressedBuffer = options.maxSizeKB
      ? await this.compressToMaxSize(file.buffer, options.maxSizeKB * 1024)
      : await sharp(file.buffer)
          .jpeg({ quality: options?.quality })
          .toBuffer();

    return compressedBuffer.length;
  }

  private static async compressToMaxSize(
    buffer: Buffer,
    maxSizeInBytes: number,
    step = 5
  ): Promise<Buffer> {
    let quality = 90;
    let compressedBuffer = buffer;

    while (quality > 10) {
      compressedBuffer = await sharp(buffer)
        .jpeg({ quality })
        .toBuffer();

      if (compressedBuffer.length <= maxSizeInBytes) break;
      quality -= step;
    }

    return compressedBuffer;
  }

    static isValidMimeType(mimeType: string): boolean {
    return BUSINESS_RULES.DOCUMENT.ALLOWED_MIME_TYPES.includes(mimeType);
  }

  static isValidFileSize(size: number): boolean {
    return size <= BUSINESS_RULES.DOCUMENT.MAX_FILE_SIZE;
  }

  static getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || '';
  }

  static generateUniqueFilename(originalName: string): string {
    const ext = this.getFileExtension(originalName);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${random}.${ext}`;
  }
}