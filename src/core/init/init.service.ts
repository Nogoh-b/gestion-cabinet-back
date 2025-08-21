import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { UPLOAD_DOCS_PATH } from '../common/constants/constants';

@Injectable()
export class InitService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InitService.name);

  async onApplicationBootstrap() {
    this.logger.log('Initialisation en cours...');
    console.log('Initialisation en cours...');
    // creation des dossiers
    this.createFolders();
  }
  createFolders() {
    if (!existsSync(UPLOAD_DOCS_PATH)) {
      mkdirSync(UPLOAD_DOCS_PATH, { recursive: true });
    }
  }
}