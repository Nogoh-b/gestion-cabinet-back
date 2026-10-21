// src/modules/ai-skills/ai-skills.module.ts
import { Module, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { AiDatabaseModule } from 'src/core/ai-database/ai-database.module';
import { AiSkillRegistry } from 'src/core/ai-database/skills/ai-skill.registry';
import type { AiSkillHandler } from 'src/core/ai-database/skills/ai-skill.types';
import { AiActionRegistry, type AiActionHandler } from 'src/core/ai-database/write/ai-action.registry';
import { AudiencesModule } from '../audiences/audiences.module';
import { ChatModule } from '../chat/chat.module';
import { ClientPortalModule } from '../client-portal/client-portal.module';
import { DocumentsModule } from '../documents/documents.module';
import { MailTemplateModule } from '../mail-template/mail-template.module';
import { PdfTemplatesModule } from '../pdf-templates/pdf-templates.module';
import { ReportsModule } from '../reports/reports.module';
import {
  CreerDiligenceSkill,
  EnregistrerPaiementSkill,
  ProgrammerAudienceSkill,
  ReporterAudienceSkill,
} from './agenda.skills';
import {
  EnvoyerEmailSkill,
  EnvoyerFactureSkill,
  MessageCollaborateurSkill,
  MessagePortailSkill,
  RelancerImpayesSkill,
  WhatsappSkill,
} from './communication.skills';
import { CourrierSkill, MiseEnDemeureSkill, TraduireSkill } from './document.skills';
import { CreerModeleSkill, DocumentModeleSkill, RedigerDocumentSkill } from './document-studio.skills';
import {
  CompteRenduAudienceSkill,
  EtatImpayesSkill,
  ExportDossierSkill,
  RapportActiviteSkill,
} from './report.skills';
import {
  EnvoyerEmailAiAction,
  MessageCollaborateurAiAction,
  MessagePortailAiAction,
  ReporterAudienceAiAction,
} from './skill-actions';
import { SkillTargetsService } from './skill-targets.service';
import { findTarget } from 'src/core/ai-database/skills/skill-helpers';
import {
  AuditContratSkill,
  ChronologieSkill,
  ControleActeSkill,
  DossierPlaidoirieSkill,
  DossiersComparablesSkill,
  EvaluerChancesSkill,
  LectureJugementSkill,
  ReponseConclusionsSkill,
} from './analysis.skills';
import {
  AnonymiserSkill,
  ConventionHonorairesSkill,
  DecompteCreanceSkill,
  DelaisProcedureSkill,
  InjonctionPayerSkill,
  VersionBilingueSkill,
} from './legal-tools.skills';

const ACTIONS = [EnvoyerEmailAiAction, MessagePortailAiAction, MessageCollaborateurAiAction, ReporterAudienceAiAction];

/** Ordre du menu « # » dans chaque famille. */
const SKILLS = [
  // Communication
  EnvoyerEmailSkill,
  WhatsappSkill,
  MessagePortailSkill,
  MessageCollaborateurSkill,
  EnvoyerFactureSkill,
  RelancerImpayesSkill,
  // Documents
  RedigerDocumentSkill,
  DocumentModeleSkill,
  CreerModeleSkill,
  CourrierSkill,
  MiseEnDemeureSkill,
  TraduireSkill,
  VersionBilingueSkill,
  AnonymiserSkill,
  // Analyse juridique
  LectureJugementSkill,
  ReponseConclusionsSkill,
  ChronologieSkill,
  AuditContratSkill,
  ControleActeSkill,
  EvaluerChancesSkill,
  DossiersComparablesSkill,
  DossierPlaidoirieSkill,
  // Calculs & actes
  DelaisProcedureSkill,
  DecompteCreanceSkill,
  InjonctionPayerSkill,
  ConventionHonorairesSkill,
  // Rapports & exports
  RapportActiviteSkill,
  EtatImpayesSkill,
  ExportDossierSkill,
  CompteRenduAudienceSkill,
  // Agenda & tâches
  ProgrammerAudienceSkill,
  ReporterAudienceSkill,
  CreerDiligenceSkill,
  EnregistrerPaiementSkill,
];

/**
 * Compétences du chat (« # ») : actions spécialisées qui réutilisent les
 * services des écrans (e-mail, espace client, messagerie, modèles PDF,
 * rapports, audiences). Chaque compétence aboutit à une carte à valider.
 */
@Module({
  imports: [
    AiDatabaseModule,
    AudiencesModule,
    ChatModule,
    ClientPortalModule,
    DocumentsModule,
    MailTemplateModule,
    PdfTemplatesModule,
    ReportsModule,
  ],
  providers: [SkillTargetsService, ...ACTIONS, ...SKILLS],
})
export class AiSkillsModule implements OnModuleInit {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly actions: AiActionRegistry,
    private readonly skills: AiSkillRegistry,
  ) {}

  onModuleInit() {
    for (const type of ACTIONS) this.actions.register(this.moduleRef.get<AiActionHandler>(type));
    for (const type of SKILLS) this.skills.register(this.moduleRef.get<AiSkillHandler>(type));
    // Conversation et conseil : faits de la fiche mentionnée (@ ou page ouverte).
    const targets = this.moduleRef.get(SkillTargetsService);
    this.skills.registerFactsProvider(async (references, user) => {
      const target = findTarget(references, ['dossier', 'client', 'audience', 'facture', 'diligence', 'employee']);
      if (!target) return '';
      const info = await targets.load(target);
      return `${info.label}\n${await targets.facts(info, user)}`;
    });
  }
}
