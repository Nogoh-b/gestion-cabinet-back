import { describe, it, expect } from '@jest/globals';
import {
  buildHelpMessages,
  loadHelpDocs,
  matchHelpDocs,
  normalizeHelpText,
  splitPageContext,
} from './help-knowledge';
import { IntentDetectionService } from './intent-detection.service';

const topId = (question: string) => matchHelpDocs(question)[0]?.doc.id;

describe('help-knowledge', () => {
  it('loads every documented module with a title and keywords', () => {
    const docs = loadHelpDocs();
    const ids = docs.map((doc) => doc.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'dossier',
        'facturation-configuration',
        'elements-facturables',
        'factures',
        'paie',
        'employes',
        'comptabilite',
        'depenses',
        'clients',
        'audiences',
        'documents',
        'diligences',
        'procedures',
        'juridictions',
        'apporteurs',
        'agences',
        'roles-permissions',
        'modeles-documents',
        'abonnement',
        'recherche',
        'statistiques',
        'modules',
        'tableau-bord',
        'messages-notifications',
        'profil-preferences',
        'cabinet-parametres',
        'parcours-dossier',
        'espace-client',
        'administration',
        'import-export',
      ]),
    );
    for (const doc of docs) {
      expect(doc.title).toBeTruthy();
      expect(doc.keywords.length).toBeGreaterThan(3);
      expect(doc.content.length).toBeGreaterThan(500);
    }
  });

  it('keeps document ids unique', () => {
    const ids = loadHelpDocs().map((doc) => doc.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each([
    ['comment fonctionne la paie ?', 'paie'],
    ['comment générer les bulletins de paie du mois', 'paie'],
    ['comment créer un élément facturable', 'elements-facturables'],
    ['comment valider un honoraire de résultat', 'elements-facturables'],
    ['comment configurer la convention d’honoraires d’un dossier', 'facturation-configuration'],
    ['où régler la numérotation des factures', 'facturation-configuration'],
    ['comment créer un employé', 'employes'],
    ['comment saisir une écriture manuelle', 'comptabilite'],
    ['comment clôturer un exercice comptable', 'comptabilite'],
    ['comment enregistrer une note de frais', 'depenses'],
    ['comment refacturer un débours au client', 'depenses'],
    ['comment enregistrer un paiement sur une facture', 'factures'],
    ['comment ouvrir un dossier et valider l’ouverture', 'dossier'],
    ['comment créer un client', 'clients'],
    ['comment envoyer les accès à l’espace client', 'clients'],
    ['à quoi servent les types de clients', 'clients'],
    ['comment planifier une audience', 'audiences'],
    ['comment reporter une audience', 'audiences'],
    ['comment saisir le rapport d’audience', 'audiences'],
    ['comment ajouter un document à un dossier', 'documents'],
    ['comment créer un type de document', 'documents'],
    ['comment créer une diligence', 'diligences'],
    ['comment ajouter un finding à une diligence', 'diligences'],
    ['comment créer une juridiction', 'juridictions'],
    ['comment créer un type de procédure', 'procedures'],
    ['comment créer un modèle de procédure', 'procedures'],
    ['comment lancer une nouvelle procédure en cours', 'procedures'],
    ['comment créer un apporteur d’affaires', 'apporteurs'],
    ['comment payer une commission d’apporteur', 'apporteurs'],
    ['comment créer une agence', 'agences'],
    ['comment modifier les permissions d’un rôle', 'roles-permissions'],
    ['comment donner un accès à un rôle', 'roles-permissions'],
    ['comment personnaliser le modèle de mail', 'modeles-documents'],
    ['comment modifier l’en-tête et le pied de page des factures PDF', 'modeles-documents'],
    ['comment changer de plan d’abonnement', 'abonnement'],
    ['que se passe-t-il quand la limite du plan est atteinte', 'abonnement'],
    ['comment renouveler l’abonnement', 'abonnement'],
    ['comment fonctionne la recherche globale', 'recherche'],
    ['comment comparer à la période précédente dans les rapports avancés', 'statistiques'],
    ['comment exporter le rapport en PDF', 'statistiques'],
    ['quels sont les modules de mon cabinet ?', 'modules'],
    ['comment fonctionne le tableau de bord ?', 'tableau-bord'],
    ['où voir les notifications non lues ?', 'messages-notifications'],
    ['comment envoyer un message à un client ?', 'messages-notifications'],
    ['comment activer la double authentification ?', 'administration'],
    ['où configurer le serveur SMTP ?', 'administration'],
    ['comment déclarer un paiement dans le portail ?', 'espace-client'],
    ['où changer le logo du cabinet ?', 'cabinet-parametres'],
    ['comment créer une famille d’actions ?', 'parcours-dossier'],
    ['comment voir mes demandes d’avance ?', 'profil-preferences'],
    ['comment exporter une facture en PDF ?', 'import-export'],
  ])('routes "%s" to %s', (question, expected) => {
    expect(topId(question)).toBe(expected);
  });

  it('returns nothing for questions outside the documented modules', () => {
    expect(matchHelpDocs('quelle est la capitale du Cameroun ?')).toEqual([]);
  });

  it('falls back on the open page when the question names no subject', () => {
    const enriched =
      'comment créer ?\n\n--- CONTEXTE DE LA PAGE (données indicatives) ---\n{"pathname":"/comptabilite/ecritures","scope":"collection"}\n---';
    expect(matchHelpDocs(enriched)[0]?.doc.id).toBe('comptabilite');
  });

  it('ignores the page context when the question names a subject', () => {
    const enriched =
      'comment fonctionne la paie ?\n\n--- CONTEXTE DE LA PAGE ---\n{"pathname":"/comptabilite/ecritures"}\n---';
    expect(matchHelpDocs(enriched)[0]?.doc.id).toBe('paie');
  });

  it('splits the page context from the question', () => {
    expect(
      splitPageContext('bonjour\n\n--- CONTEXTE DE LA PAGE ---\n{"pathname":"/x"}'),
    ).toEqual({ question: 'bonjour', pathname: '/x' });
    expect(splitPageContext('bonjour')).toEqual({ question: 'bonjour' });
  });

  it('normalizes accents and apostrophes', () => {
    expect(normalizeHelpText('L’élément Facturable !')).toBe(
      "l'element facturable",
    );
  });

  it('builds a prompt that carries the documentation and the question', () => {
    const [match] = matchHelpDocs('comment fonctionne la paie ?');
    const messages = buildHelpMessages('comment fonctionne la paie ?', [
      match.doc,
    ]);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('DOCUMENTATION : Paie');
    expect(messages.at(-1)).toEqual({
      role: 'user',
      content: 'comment fonctionne la paie ?',
    });
  });
});

describe('help intent for documented modules', () => {
  const service = new IntentDetectionService({
    getAllHandlers: () => [],
    generateGlobalWriteSchema: async () => '',
  } as any);

  it.each([
    'comment fonctionne la paie ?',
    'comment ça marche la comptabilité',
    "c'est quoi un élément facturable ?",
    "à quoi sert la convention d'honoraires ?",
    'explique-moi les notes de frais',
    'comment configurer la facturation',
    'comment valider un honoraire de résultat',
    'comment créer un client',
    "c'est quoi une diligence ?",
    "à quoi sert un apport de dossier ?",
    "comment ça marche l'abonnement",
    'comment modifier les permissions d’un rôle',
    'comment fonctionne la recherche globale',
    'explique-moi les rapports avancés',
  ])('classifies "%s" as HELP', (question) => {
    expect(service.classifyLocal(question)).toBe('HELP');
  });

  it.each([
    "qu'est-ce qu'une assignation en droit camerounais ?",
    'explique-moi le dossier DOS-2026-0039',
    'combien de factures impayées ce mois ?',
    'combien de clients actifs avons-nous ?',
    'liste des audiences de la semaine',
    'quelles sont les juridictions de Douala ?',
    'quels documents manquent au dossier DOS-2026-0039 ?',
    'montre-moi les commissions payées ce trimestre',
  ])('does not hijack "%s"', (question) => {
    expect(service.classifyLocal(question)).not.toBe('HELP');
  });
});
