// controllers/steps.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  ParseIntPipe,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth
} from '@nestjs/swagger';

import { CreateStepDto } from './dto/create-step.dto';
import { Step, StepType, StepStatus } from './entities/step.entity';
import { StepsService } from './step.service';




@ApiTags('Étapes des dossiers')
@ApiBearerAuth()
@Controller('dossiers')
export class StepsController {
  constructor(private readonly stepsService: StepsService) {}

  @Post('/steps/create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Créer une étape manuellement',
    description: 'Crée une nouvelle étape personnalisée pour un dossier'
  })
  @ApiParam({
    name: 'dossierId',
    description: 'ID du dossier',
    type: Number,
    example: 1
  })
  @ApiBody({
    type: CreateStepDto,
    description: 'Données de la nouvelle étape'
  })
  @ApiResponse({
    status: 201,
    description: 'Étape créée avec succès',
    type: Step
  })
  @ApiResponse({
    status: 404,
    description: 'Dossier non trouvé'
  })
  @ApiResponse({
    status: 400,
    description: 'Données invalides'
  })
  async createStep(
    @Body() createStepDto: CreateStepDto
  ) {
    console.log(createStepDto)
    return this.stepsService.createStep(createStepDto.dossierId, createStepDto);
  }

  @Get(':dossierId/steps/workflow')
  @ApiOperation({ 
    summary: 'Obtenir le workflow complet du dossier',
    description: 'Retourne toutes les étapes du dossier dans l\'ordre chronologique'
  })
  @ApiParam({
    name: 'dossierId',
    description: 'ID du dossier',
    type: Number,
    example: 1
  })
  @ApiResponse({
    status: 200,
    description: 'Workflow récupéré avec succès',
    type: [Step]
  })
  @ApiResponse({
    status: 404,
    description: 'Dossier non trouvé'
  })
  async getWorkflow(@Param('dossierId', ParseIntPipe) dossierId: number) {
    return this.stepsService.getDossierWorkflow(dossierId);
  }

  @Post(':dossierId/steps/amiable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Gérer la phase amiable',
    description: 'Termine la phase amiable et passe à l\'étape suivante selon le résultat (clôture si accord, contentieux si échec)'
  })
  @ApiParam({
    name: 'dossierId',
    description: 'ID du dossier',
    type: Number,
    example: 1
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        agreementReached: {
          type: 'boolean',
          description: 'Indique si un accord amiable a été trouvé',
          example: true
        }
      },
      required: ['agreementReached']
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Phase amiable traitée avec succès',
    type: Step
  })
  @ApiResponse({
    status: 404,
    description: 'Dossier ou étape amiable non trouvé'
  })
  async handleAmiablePhase(
    @Param('dossierId', ParseIntPipe) dossierId: number,
    @Body('agreementReached') agreementReached: boolean
  ) {
    return this.stepsService.handleAmiablePhase(dossierId, agreementReached);
  }

  @Post(':dossierId/steps/appeal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Initier une voie de recours',
    description: 'Crée ou active une étape de recours pour le dossier'
  })
  @ApiParam({
    name: 'dossierId',
    description: 'ID du dossier',
    type: Number,
    example: 1
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        appealType: {
          type: 'string',
          description: 'Type de recours (appel, pourvoi, etc.)',
          example: 'appel'
        }
      },
      required: ['appealType']
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Recours initié avec succès',
    type: Step
  })
  @ApiResponse({
    status: 404,
    description: 'Dossier non trouvé'
  })
  async initiateAppeal(
    @Param('dossierId', ParseIntPipe) dossierId: number,
    @Body('appealType') appealType: string
  ) {
    return this.stepsService.initiateAppeal(dossierId, appealType);
  }

  @Post(':dossierId/steps/next')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Passer à l\'étape suivante',
    description: 'Termine l\'étape courante et active l\'étape suivante dans le workflow'
  })
  @ApiParam({
    name: 'dossierId',
    description: 'ID du dossier',
    type: Number,
    example: 1
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        currentStepType: {
          enum: Object.values(StepType),
          description: 'Type de l\'étape courante à terminer',
          example: StepType.AMIABLE
        }
      },
      required: ['currentStepType']
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Passage à l\'étape suivante réussi',
    type: Step
  })
  @ApiResponse({
    status: 404,
    description: 'Dossier ou étape non trouvé'
  })
  @ApiResponse({
    status: 400,
    description: 'Impossible de passer à l\'étape suivante'
  })
  async moveToNextStep(
    @Param('dossierId', ParseIntPipe) dossierId: number,
    @Body('currentStepType') currentStepType: StepType
  ) {
    return this.stepsService.moveToNextStep(dossierId, currentStepType);
  }

  @Put(':dossierId/steps/:stepId')
  @ApiOperation({ 
    summary: 'Mettre à jour une étape',
    description: 'Modifie les informations d\'une étape spécifique'
  })
  @ApiParam({
    name: 'dossierId',
    description: 'ID du dossier',
    type: Number,
    example: 1
  })
  @ApiParam({
    name: 'stepId',
    description: 'ID de l\'étape à modifier',
    type: Number,
    example: 1
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: {
          enum: Object.values(StepStatus),
          description: 'Nouveau statut de l\'étape',
          example: StepStatus.COMPLETED
        },
        title: {
          type: 'string',
          description: 'Titre de l\'étape',
          example: 'Phase contentieuse - Audience principale'
        },
        description: {
          type: 'string',
          description: 'Description de l\'étape',
          example: 'Première audience devant le tribunal'
        },
        scheduledDate: {
          type: 'string',
          format: 'date-time',
          description: 'Date prévue pour cette étape',
          example: '2024-01-15T10:00:00.000Z'
        },
        completedDate: {
          type: 'string',
          format: 'date-time',
          description: 'Date de completion de l\'étape',
          example: '2024-01-15T12:00:00.000Z'
        },
        metadata: {
          type: 'object',
          description: 'Métadonnées supplémentaires',
          example: {
            decision: 'Mise en délibéré',
            nextHearing: '2024-02-01T14:00:00.000Z'
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Étape mise à jour avec succès',
    type: Step
  })
  @ApiResponse({
    status: 404,
    description: 'Étape non trouvée'
  })
  async updateStep(
    @Param('stepId', ParseIntPipe) stepId: number,
    @Body() updateData: Partial<Step>
  ) {
    return this.stepsService.updateStep(stepId, updateData);
  }

  @Get(':dossierId/steps/current')
  @ApiOperation({ 
    summary: 'Obtenir l\'étape courante',
    description: 'Retourne l\'étape actuellement en cours pour le dossier'
  })
  @ApiParam({
    name: 'dossierId',
    description: 'ID du dossier',
    type: Number,
    example: 1
  })
  @ApiResponse({
    status: 200,
    description: 'Étape courante récupérée avec succès',
    type: Step
  })
  @ApiResponse({
    status: 404,
    description: 'Dossier non trouvé ou aucune étape en cours'
  })
  async getCurrentStep(@Param('dossierId', ParseIntPipe) dossierId: number) {
    return this.stepsService.getCurrentStep(dossierId);
  }

  @Post(':dossierId/steps/closure')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Passer directement à la clôture',
    description: 'Termine le dossier et passe directement à l\'étape de clôture (utilisé en cas d\'accord amiable)'
  })
  @ApiParam({
    name: 'dossierId',
    description: 'ID du dossier',
    type: Number,
    example: 1
  })
  @ApiResponse({
    status: 200,
    description: 'Passage à la clôture réussi',
    type: Step
  })
  @ApiResponse({
    status: 404,
    description: 'Dossier non trouvé'
  })
  async moveToClosure(@Param('dossierId', ParseIntPipe) dossierId: number) {
    return this.stepsService.moveToClosure(dossierId);
  }
}