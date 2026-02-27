import { createWriteStream, existsSync } from 'fs';
import * as mime from 'mime-types';
import { join } from 'path';
import * as sharp from 'sharp';



import { BUSINESS_RULES } from '../interfaces/business-rules.constants';
import { AttachmentType } from 'src/modules/chat/entities/attachment.entity';
import { mkdir } from 'fs/promises';

export interface UploadedFileInfo {
  fileName: string;
  fileSize: number;
  filePath: string;
  mimeType: string;
  originalName: string;
}

export interface UploadOptions {
  maxSizeKB?: number;  // Taille maximale en KB
  quality?: number;    // Qualité pour les images (1-100)
  allowedMimeTypes?: string[];
}


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


// Configuration (dans votre fichier .env ou config)

 private static getRelativeUploadPath(fullPath: string) {
  const normalized = fullPath.replace(/\\/g, '/');
  const index = normalized.indexOf('/uploads/');
  return index !== -1 ? normalized.substring(index) : normalized;
}

static async uploadFileV1(
  file: Express.Multer.File,
  uploadDir: string, // ex: './uploads/chat'
  options?: { 
    maxSizeKB?: number;
    width?: number;
    quality?: number;
  }
): Promise<{
  fileName: string;
  filePath: string;      // Chemin physique sur le serveur
  fileUrl: string;        // URL publique pour le téléchargement
  fileSize: number;
  fileType: AttachmentType;
  mimeType: string;
  thumbnailUrl?: string;  // URL publique de la miniature
  thumbnailPath?: string; // Chemin physique de la miniature
}> {
  console.log('Upload path ', uploadDir )
  const APP_URL = process.env.APP_URL || 'http://localhost:3000';
  const UPLOADS_URL_PREFIX = '/uploads'; // Le préfixe d'URL pour vos fichiers
  const fileName = FilesUtil.generateUniqueFilename(file.originalname);
  
  // Chemin physique complet sur le serveur
  const filePath = join(uploadDir, fileName);
  
  // URL publique pour accéder au fichier
  const fileUrl = `${APP_URL}${this.getRelativeUploadPath(uploadDir)}/${fileName}`;
  
  let finalBuffer: Buffer;
  
  // Déterminer le type de fichier
  const fileType = this.determineFileType(file.mimetype, file.originalname);
  
  // Vérifier si c'est une image et si on doit la traiter
  const isImage = file.mimetype.startsWith('image/');
  const shouldProcessImage = isImage && (options?.maxSizeKB || options?.quality || options?.width);
  
  // Variables pour les miniatures
  let thumbnailUrl: string | undefined;
  let thumbnailPath: string | undefined;

  if (shouldProcessImage) {
    // Traitement des images avec compression
    let sharpInstance = sharp(file.buffer);

    if (options?.width) {
      sharpInstance = sharpInstance.resize(options.width, null, {
        withoutEnlargement: true,
        fit: 'inside'
      });
    }

    const outputFormat = file.mimetype === 'image/png' ? 'png' : 'jpeg';
    
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
    
    // Écrire le fichier traité
    await sharp(finalBuffer).toFile(filePath);
    
    // Générer une miniature
    if (fileType === AttachmentType.IMAGE) {
      const thumbnailResult = await this.generateThumbnail(
        filePath, 
        fileName, 
        uploadDir,
        APP_URL,
        UPLOADS_URL_PREFIX
      );
      thumbnailPath = thumbnailResult.thumbnailPath;
      thumbnailUrl = thumbnailResult.thumbnailUrl;
    }

  } else {
    // Traitement des fichiers non-images
    finalBuffer = file.buffer;
    
    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(filePath);
      stream.on('finish', () => resolve());
      stream.on('error', (err) => reject(err));
      stream.end(finalBuffer);
    });
  }

  // Obtenir la taille réelle du fichier
  const actualFileSize = await this.getActualFileSize(filePath);
  
  console.log(`Debug - Fichier uploadé: ${fileName}`);
  console.log(`Debug - Chemin physique: ${filePath}`);
  console.log(`Debug - URL publique: ${fileUrl}`);
  console.log(`Debug - Type: ${fileType}`);
  console.log(`Debug - Taille: ${actualFileSize} bytes`);

  return {
    fileName,
    filePath,      // Pour les opérations serveur (suppression, lecture, etc.)
    fileUrl,       // Pour le téléchargement/client
    fileSize: actualFileSize,
    fileType,
    mimeType: file.mimetype,
    ...(thumbnailUrl && { thumbnailUrl }),
    ...(thumbnailPath && { thumbnailPath })
  };
}

/**
 * Génère une miniature et retourne ses chemins
 */
private static async generateThumbnail(
  originalPath: string,
  originalFileName: string,
  basePath: string,
  appUrl: string,
  urlPrefix: string
): Promise<{ thumbnailPath: string; thumbnailUrl: string }> {
  const thumbnailName = `thumb_${originalFileName}`;
  const thumbnailDir = join(basePath, 'thumbnails');
  const thumbnailPath = join(thumbnailDir, thumbnailName);
  const thumbnailUrl = `${appUrl}${this.getRelativeUploadPath(basePath)}/thumbnails/${thumbnailName}`;
  
  // Créer le dossier thumbnails s'il n'existe pas
  if (!existsSync(thumbnailDir)) {
    await mkdir(thumbnailDir, { recursive: true });
  }
  
  // Générer la miniature
  await sharp(originalPath)
    .resize(200, 200, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .toFile(thumbnailPath);
  
  return { thumbnailPath, thumbnailUrl };
}

/**
 * Détermine le type de fichier basé sur le MIME type et l'extension
 */
private static determineFileType(mimetype: string, filename: string): AttachmentType {
  // Vérifier par le MIME type
  if (mimetype.startsWith('image/')) {
    return AttachmentType.IMAGE;
  }
  if (mimetype.startsWith('video/')) {
    return AttachmentType.VIDEO;
  }
  if (mimetype.startsWith('audio/')) {
    return AttachmentType.AUDIO;
  }
  
  // Vérifier par l'extension pour certains types de documents
  const extension = filename.split('.').pop()?.toLowerCase();
  const documentExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'];
  
  if (extension && documentExtensions.includes(extension)) {
    return AttachmentType.DOCUMENT;
  }
  
  // Par défaut
  return AttachmentType.FILE;
}



  static async uploadFilesSafe(
    files: Express.Multer.File[],
    FILE_PATH: string,
    mimetype: string,
    options?: {
      maxSizeKB?: number;
      width?: number;
      quality?: number;
    }
  ): Promise<{
    success: Array<{ fileName: string; fileMimeType?: string; fileSize: number }>;
    failed: Array<{ originalName: string; error: string }>;
  }> {
    const success: Array<{ fileName: string; fileMimeType?: string; fileSize: number }> = [];
    const failed: Array<{ originalName: string; error: string }> = [];

    await Promise.all(
      (files || []).map(async file => {
        try {
          const result = await this.uploadFile(file, FILE_PATH, mimetype, options);
          success.push(result);
        } catch (error) {
          failed.push({
            originalName: file.originalname,
            error: error.message,
          });
        }
      })
    );

    return { success, failed };
  }

  static async uploadFiles(
  files: Express.Multer.File[],
  FILE_PATH: string,
  mimetype: string,
  options?: {
    maxSizeKB?: number;
    width?: number;
    quality?: number;
  }
): Promise<Array<{ fileName: string; fileMimeType?: string; fileSize: number }>> {
  if (!files || files.length === 0) {
    return [];
  }

  try {
    // 🚀 traitement en parallèle (rapide)
    const uploadPromises = files.map(file =>
      this.uploadFileV1(file, FILE_PATH, options)
    );

    const results = await Promise.all(uploadPromises);

    return results;
  } catch (error) {
    throw new Error(`Erreur lors de l'upload multiple: ${error.message}`);
  }
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