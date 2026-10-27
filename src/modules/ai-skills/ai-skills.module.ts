// src/modules/ai-skills/ai-skills.module.ts
import { forwardRef, Module, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { AiDatabaseModule } from 'src/core/ai-database/ai-database.module';
import { AiSkillRegistry } from 'src/core/ai-database/skills/ai-skill.registry';
import type { AiSkillHandler, AiSkillTargetType } from 'src/core/ai-database/skills/ai-skill.types';
import { AiActionRegistry, type AiActionHandler } from 'src/core/ai-database/write/ai-action.registry';
import { AudiencesModule } from '../audiences/audiences.module';
import { CaseWorkflowModule } from '../case-workflow/case-workflow.module';
import { ChatModule } from '../chat/chat.module';
import { ClientPortalModule } from '../client-portal/client-portal.module';
import { DocumentsModule } from '../documents/documents.module';
import { MailTemplateModule } from '../mail-template/mail-template.module';
import { PdfTemplatesModule } from '../pdf-templates/pdf-templates.module';
import { TemplateBlocksModule } from '../template-blocks/template-blocks.module';
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
import { TraduireSkill } from './document.skills';
import { RedigerDocumentSkill } from './document-studio.skills';
import { ModelesSkill } from './template.skills';
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
import { ConfigurerFacturationAiAction, ConfigurerFacturationSkill, DevisHonorairesSkill } from './billing.skills';
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
import { TranscrireAudioSkill } from './transcription.skills';
import {
  AnonymiserSkill,
  ConventionHonorairesSkill,
  DecompteCreanceSkill,
  DelaisProcedureSkill,
  InjonctionPayerSkill,
  VersionBilingueSkill,
} from './legal-tools.skills';

const ACTIONS = [EnvoyerEmailAiAction, MessagePortailAiAction, MessageCollaborateurAiAction, ReporterAudienceAiAction, ConfigurerFacturationAiAction];

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
  ModelesSkill,
  TraduireSkill,
  VersionBilingueSkill,
  AnonymiserSkill,
  // Analyse juridique
  TranscrireAudioSkill,
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
  // Facturation
  ConfigurerFacturationSkill,
  DevisHonorairesSkill,
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
    TemplateBlocksModule,
    ReportsModule,
    // Facturation des dossiers (profil, éléments facturables) : même service que l'onglet Facturation.
    forwardRef(() => CaseWorkflowModule),
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
    this.skills.registerFactsProvider(async (references, user, question) => {
      const types: AiSkillTargetType[] = ['dossier', 'client', 'audience', 'facture', 'diligence', 'employee'];
      // Une mention @ passe avant la fiche ouverte (« @facture » depuis la page d'un dossier).
      const explicit = references.filter((reference) => reference.source !== 'page');
      const target = findTarget(explicit, types) ?? findTarget(references, types);
      if (!target) return '';
      const info = await targets.load(target);
      return `${info.label}\n${await targets.facts(info, user, question)}`;
    });
    // Brouillons (e-mail, WhatsApp, courrier) : références de la fiche à insérer.
    this.skills.registerReferencesProvider(async (references, user) => {
      const target = findTarget(references, ['dossier', 'audience', 'facture', 'diligence', 'client']);
      if (!target) return [];
      return targets.draftReferences(await targets.load(target), user);
    });
  }
}
