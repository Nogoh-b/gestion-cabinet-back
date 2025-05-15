// interfaces/send-mail.interface.ts
export interface SendMailOptions {
  to: string;
  subject: string;
  template: string;
  context?: Record<string, any>;
  attachments?: Array<{
    filename: string;
    content?: Buffer;
    path?: string;
  }>;
}