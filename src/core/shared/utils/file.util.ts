import { createWriteStream } from 'fs';
import * as mime from 'mime-types';
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
    mimetype: string,
    options?: { 
      maxSizeKB?: number;
      width?: number;
      quality?: number;
    }
  ): Promise<{fileName: string, fileMimeType?: string,fileSize: number}> {
    const fileName = FilesUtil.generateUniqueFilename(file.originalname);
    const filePath = join(FILE_PATH, fileName);
    let finalBuffer: Buffer;
    let finalSize: number;

    // Vérifier si c'est une image et si on doit la traiter
    const isImage = file.mimetype.startsWith('image/');
    const shouldProcessImage = isImage && (options?.maxSizeKB || options?.quality || options?.width);

    if (shouldProcessImage) {
      // Traitement des images avec compression
      let sharpInstance = sharp(file.buffer);

      // Appliquer le redimensionnement si demandé
      if (options?.width) {
        sharpInstance = sharpInstance.resize(options.width, null, {
          withoutEnlargement: true,
          fit: 'inside'
        });
      }

      // Déterminer le format de sortie
      const outputFormat = file.mimetype === 'image/png' ? 'png' : 'jpeg';
      
      // Options de compression
      const compressOptions = {
        [outputFormat]: {
          quality: options?.quality || 80,
          ...(outputFormat === 'png' && { compressionLevel: 9 })
        }
      };

      if (options?.maxSizeKB) {
        finalBuffer = await this.compressToMaxSize(
          file.buffer,
          options.maxSizeKB * 1024,
          options.width,
          outputFormat
        );
      } else {
        finalBuffer = await sharpInstance
          .toFormat(outputFormat, compressOptions[outputFormat])
          .toBuffer();
      }

      finalSize = finalBuffer.length;
      
      // Écrire le fichier traité
      await sharp(finalBuffer).toFile(filePath);

    } else {
      // Traitement des fichiers non-images ou images sans traitement
      finalBuffer = file.buffer;
      finalSize = file.size;
      
      await new Promise<void>((resolve, reject) => {
        const stream = createWriteStream(filePath);
        stream.on('finish', () => resolve());
        stream.on('error', (err) => reject(err));
        stream.end(finalBuffer);
      });
    }

    // Vérification de la taille réelle du fichier écrit
    const actualFileSize = await this.getActualFileSize(filePath);
    
    console.log(`Debug - Taille originale: ${file.size} bytes`);
    console.log(`Debug - Taille calculée: ${finalSize} bytes`);
    console.log(`Debug - Taille réelle sur disque: ${actualFileSize} bytes`);

    const ext = file.originalname.split('.').pop() || '';
    const mimeType = mime.lookup(ext) || 'application/octet-stream';
    console.log('MIME détecté:', mimeType);
    return {
      fileName,
      fileSize: actualFileSize, // Retourner la taille réelle
      fileMimeType: mimeType || 'application/octet-stream'
    };
  }

  /**
   * Méthode pour obtenir la taille réelle d'un fichier sur le disque
   */
  private static async getActualFileSize(filePath: string): Promise<number> {
    const fs = await import('fs/promises');
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  /**
   * Compression avec contrôle de taille maximale - version améliorée
   */
  private static async compressToMaxSize(
    buffer: Buffer,
    maxSizeInBytes: number,
    width?: number,
    format: 'jpeg' | 'png' = 'jpeg'
  ): Promise<Buffer> {
    let quality = 90;
    let compressedBuffer: Buffer;

    // Si le fichier est déjà en dessous de la taille max, retourner tel quel
    if (buffer.length <= maxSizeInBytes) {
      return buffer;
    }

    for (let q = quality; q >= 10; q -= 5) {
      let sharpInstance = sharp(buffer);

      // Appliquer le redimensionnement si demandé
      if (width) {
        sharpInstance = sharpInstance.resize(width, null, {
          withoutEnlargement: true,
          fit: 'inside'
        });
      }

      // Compression selon le format
      const compressOptions = format === 'png' 
        ? { compressionLevel: Math.floor((100 - q) / 10) }
        : { quality: q };

      compressedBuffer = await sharpInstance
        .toFormat(format, compressOptions)
        .toBuffer();

      // Vérifier si on a atteint la taille cible
      if (compressedBuffer.length <= maxSizeInBytes) {
        console.log(`Compression réussie: ${compressedBuffer.length} bytes (qualité: ${q})`);
        return compressedBuffer;
      }
    }

    // Si on arrive ici, retourner la plus petite version obtenue
    console.log(`Compression minimale: ${compressedBuffer!.length} bytes`);
    return compressedBuffer!;
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