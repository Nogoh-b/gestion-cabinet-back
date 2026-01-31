export class MimeTypeUtils {
  private static readonly TYPE_NAMES: Record<string, string> = {
    'application/pdf': 'PDF Document',
    'image/jpeg': 'JPEG Image',
    'image/png': 'PNG Image',
    'image/gif': 'GIF Image',
    'image/svg+xml': 'SVG Image',
    'application/msword': 'Word Document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
    'application/vnd.ms-excel': 'Excel Spreadsheet',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel Spreadsheet',
    'application/vnd.ms-powerpoint': 'PowerPoint Presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint Presentation',
    'text/plain': 'Text File',
    'text/csv': 'CSV File',
    'application/json': 'JSON File',
    'application/xml': 'XML File',
    'application/zip': 'ZIP Archive',
    'application/x-rar-compressed': 'RAR Archive',
    'audio/mpeg': 'MP3 Audio',
    'video/mp4': 'MP4 Video',
    'application/x-msdownload': 'Windows Executable',
  };

  static getFileTypeName(mimetype: string): string {
    if (!mimetype) return 'Unknown File Type';
    
    if (this.TYPE_NAMES[mimetype]) {
      return this.TYPE_NAMES[mimetype];
    }
    
    const [type, subtype] = mimetype.split('/');
    const formattedType = type.charAt(0).toUpperCase() + type.slice(1);
    
    // Formatage spécial pour certains types
    if (type === 'application') {
      return `${subtype?.toUpperCase() || 'Application'} File`;
    }
    
    return `${formattedType} File`;
  }
}