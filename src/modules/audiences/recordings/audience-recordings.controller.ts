import {
  BadRequestException,
  Body,
  CallHandler,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  Injectable,
  NestInterceptor,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { existsSync } from 'fs';
import { diskStorage } from 'multer';
import { join } from 'path';

import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { DossierScopeUser } from '../../dossiers/dossier-role-scope';
import {
  AudienceRecordingsService,
  isRecordingMime,
  RECORDING_MAX_BYTES,
  RecordingUploadInput,
  recordingExtension,
  UPLOADS_ROOT,
} from './audience-recordings.service';

/** Dossier cible posé sur la requête par l'intercepteur, lu par multer. */
const TARGET_DIR = Symbol('audienceRecordingDir');

/**
 * Avant que multer n'écrive le segment : réglage actif, audience accessible
 * et quota de stockage du cabinet (taille annoncée de la requête).
 */
@Injectable()
export class RecordingUploadPrecheck implements NestInterceptor {
  constructor(private readonly recordings: AudienceRecordingsService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const expected = Number(req.headers?.['content-length']) || 0;
    const { dir } = await this.recordings.prepareUpload(
      Number(req.params?.id),
      req.user,
      expected,
    );
    req[TARGET_DIR] = dir;
    return next.handle();
  }
}

const recordingUpload = FileInterceptor('file', {
  storage: diskStorage({
    destination: (req: any, _file, cb) => {
      const dir = req[TARGET_DIR];
      if (!dir) return cb(new BadRequestException('Téléversement refusé.'), '');
      cb(null, join(UPLOADS_ROOT, dir));
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}${recordingExtension(file.mimetype)}`);
    },
  }),
  limits: { fileSize: RECORDING_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isRecordingMime(file.mimetype)) {
      return cb(new BadRequestException('Format audio non pris en charge.'), false);
    }
    cb(null, true);
  },
});

@ApiTags('Audiences — enregistrements')
@Controller('audiences')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AudienceRecordingsController {
  constructor(private readonly recordings: AudienceRecordingsService) {}

  /** Réglage plateforme `audio` utile au navigateur (avant `GET /audiences/:id`). */
  @Get('recording-config')
  @RequirePermissions('view_audiences')
  @ApiOperation({ summary: "Réglages d'enregistrement audio des audiences" })
  getConfig() {
    return this.recordings.getConfig();
  }

  @Get(':id/recordings')
  @RequirePermissions('view_audiences')
  @ApiOperation({ summary: "Segments audio enregistrés d'une audience" })
  list(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: DossierScopeUser,
  ) {
    return this.recordings.list(id, user);
  }

  @Post(':id/recordings')
  @RequirePermissions('edit_audience')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: "Téléverser un segment audio de l'audience" })
  @UseInterceptors(RecordingUploadPrecheck, recordingUpload)
  upload(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: RecordingUploadInput,
    @CurrentUser() user: DossierScopeUser,
  ) {
    return this.recordings.saveSegment(id, user, file, body ?? {});
  }

  @Get(':id/recordings/:rid/stream')
  @RequirePermissions('view_audiences')
  @ApiOperation({ summary: 'Lire un segment audio (flux, requêtes Range acceptées)' })
  async stream(
    @Param('id', ParseIntPipe) id: number,
    @Param('rid', ParseIntPipe) rid: number,
    @CurrentUser() user: DossierScopeUser,
    @Res() res: Response,
  ) {
    const recording = await this.recordings.findOne(id, rid, user);
    const path = this.recordings.absolutePath(recording);
    if (!existsSync(path)) {
      res.status(404).json({ message: 'Fichier audio introuvable' });
      return;
    }
    res.sendFile(path, {
      headers: { 'Content-Type': recording.mime, 'Cache-Control': 'no-store' },
    });
  }

  @Post(':id/recordings/:rid/transcribe')
  @RequirePermissions('edit_audience')
  @ApiOperation({ summary: 'Transcrire un segment audio' })
  transcribe(
    @Param('id', ParseIntPipe) id: number,
    @Param('rid', ParseIntPipe) rid: number,
    @CurrentUser() user: DossierScopeUser,
  ) {
    return this.recordings.requestTranscription(id, rid, user);
  }

  @Delete(':id/recordings/:rid')
  @RequirePermissions('edit_audience')
  @ApiOperation({ summary: 'Supprimer un segment audio' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Param('rid', ParseIntPipe) rid: number,
    @CurrentUser() user: DossierScopeUser,
  ) {
    return this.recordings.remove(id, rid, user);
  }

  @Delete(':id/recordings')
  @RequirePermissions('edit_audience')
  @ApiOperation({ summary: "Supprimer tous les enregistrements de l'audience" })
  removeAll(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: DossierScopeUser,
  ) {
    return this.recordings.removeAll(id, user);
  }
}
