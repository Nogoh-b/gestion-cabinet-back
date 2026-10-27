/// <reference types="jest" />
import {
  confidentMatch, designatingWords, designationPart, humanVariable, mailUsage, pdfUsage, rankTemplates, readableText,
  refersToEarlierTemplate, templateCitedEarlier, templateCitedIn,
} from './template-search';

const catalog = [
  { code: 'audience_convocation', name: 'Audience — Avis au client', usage: 'pour les audiences' },
  { code: 'audience_liste', name: 'Audience — Liste du jour', usage: 'pour les listes d’audiences' },
  { code: 'facture_standard', name: 'Facture standard', usage: 'pour les factures' },
  { code: 'facture_client', name: 'Facture client', usage: 'pour les factures' },
  { code: 'general_courrier', name: 'Courrier général', description: 'Lettre simple du cabinet', usage: 'pour un usage général' },
];

describe('recherche par le nom', () => {
  it('« Avis au client » suffit, sans code', () => {
    expect(confidentMatch(catalog, 'je veux lire le modèle Avis au client')?.code).toBe('audience_convocation');
  });

  it('retrouve malgré le pluriel et une faute de frappe', () => {
    expect(confidentMatch(catalog, 'modifier les avis aux clients')?.code).toBe('audience_convocation');
    expect(confidentMatch(catalog, 'modifie le modèle Courier général')?.code).toBe('general_courrier');
  });

  it('le code reste accepté', () => {
    expect(confidentMatch(catalog, 'peu importe', 'facture_client')?.code).toBe('facture_client');
  });

  it('plusieurs modèles possibles : rien n’est choisi, tous sont proposés', () => {
    expect(confidentMatch(catalog, 'le modèle de facture')).toBeNull();
    expect(rankTemplates(catalog, 'facture').map((match) => match.entry.code)).toEqual(expect.arrayContaining(['facture_standard', 'facture_client']));
  });

  it('un nom qui n’existe pas : proposition des plus proches, jamais de choix d’office', () => {
    expect(confidentMatch(catalog, 'Facture annuelle')).toBeNull();
    expect(rankTemplates(catalog, 'Facture annuelle')[0].entry.code).toMatch(/^facture_/);
  });

  it('la demande « un modèle de document » ne désigne aucun modèle précis', () => {
    expect(designatingWords('je veux modifier un modèle de document')).toEqual([]);
    expect(confidentMatch(catalog, 'je veux modifier un modèle de document')).toBeNull();
  });

  it('la consigne après les deux-points ne sert pas à désigner le modèle', () => {
    expect(designationPart('modifie le mail du dossier client : mets l’objet à Bienvenue')).toBe('modifie le mail du dossier client');
  });
});

describe('texte lisible', () => {
  it('remplace les variables par des mots courants', () => {
    expect(humanVariable('dossier.client_name')).toBe('nom du client');
    expect(humanVariable('audienceDate_fmt')).toBe('date de l’audience');
    expect(humanVariable('activationUrl')).toBe('activation url');
  });

  it('retire balises, accolades et entités', () => {
    const html = '<style>p{}</style><h1>AVIS D&#39;AUDIENCE</h1><p>Madame, Monsieur&nbsp;{{dossier.client_name}}</p>{{#if room}}<p>Salle {{room}}</p>{{/if}}';
    const text = readableText(html);
    expect(text).toBe('AVIS D’AUDIENCE\nMadame, Monsieur [nom du client]\nSalle [salle]');
    expect(text).not.toMatch(/[{}<>]/);
  });

  it('coupe un texte trop long', () => {
    expect(readableText('<p>' + 'mot '.repeat(400) + '</p>', 100).length).toBeLessThanOrEqual(101);
  });

  it('décrit l’usage sans vocabulaire technique', () => {
    expect(pdfUsage('audience')).toBe('les audiences');
    expect(mailUsage('dossier', 'client')).toBe('sujet : dossiers, envoyé aux clients');
  });
});

// 25/10/2026 : « rédige un document sous la base de ce modèle facture client ».
describe('modèle cité dans la conversation', () => {
  it('reconnaît un renvoi à un modèle déjà cité', () => {
    for (const question of ['rédige un document sur la base de ce modèle', 'utilise le même modèle', 'remplis le modèle ci-dessus', 'prends celui-ci']) {
      expect(refersToEarlierTemplate(question)).toBe(true);
    }
    expect(refersToEarlierTemplate('liste les modèles de documents')).toBe(false);
  });

  it('retrouve un modèle cité par son code ou son nom complet', () => {
    expect(templateCitedIn(catalog, 'rediges un document sous la base de ce modèle facture client').entry?.code).toBe('facture_client');
    expect(templateCitedIn(catalog, '📄 Modèle utilisé : Audience — Avis au client').entry?.code).toBe('audience_convocation');
    // Deux noms de même longueur (une liste) : cité, mais aucun choisi au hasard.
    expect(templateCitedIn(catalog, '- Facture standard\n- Facture client')).toEqual({ cited: true });
    expect(templateCitedIn(catalog, 'liste les factures du dossier')).toEqual({ cited: false });
  });

  it('« ce modèle » : le dernier modèle cité, le message le plus récent d’abord', () => {
    const history = [
      { role: 'user', content: 'montre le modèle Courrier général' },
      { role: 'assistant', content: '## Facture client\n\nModèle de document pour les factures' },
      { role: 'user', content: 'merci' },
    ];
    expect(templateCitedEarlier(catalog, history)?.code).toBe('facture_client');
    // Le message le plus récent qui cite des modèles est une liste : aucun choix.
    expect(templateCitedEarlier(catalog, [...history, { role: 'assistant', content: 'Facture standard, Facture client' }])).toBeUndefined();
    expect(templateCitedEarlier(catalog, [])).toBeUndefined();
  });
});
