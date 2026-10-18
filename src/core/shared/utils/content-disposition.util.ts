/**
 * En-tête `Content-Disposition` sûr pour afficher un fichier dans le navigateur.
 *
 * Node refuse (ERR_INVALID_CHAR → erreur 500) toute valeur d'en-tête hors
 * latin-1 : un document nommé « Conclusions de l’affaire.pdf » (apostrophe
 * typographique) ou en caractères arabes ne pouvait donc pas être ouvert.
 * On envoie un repli ASCII (`filename`) et le vrai nom en UTF-8 (`filename*`,
 * RFC 6266) ; les guillemets, antislashs et sauts de ligne sont retirés.
 */
export function inlineContentDisposition(fileName?: string | null): string {
  const clean =
    (fileName ?? '').replace(/[\r\n"\\]/g, '').trim() || 'document';
  const ascii =
    clean
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/%/g, '_') || 'document';
  const encoded = encodeURIComponent(clean).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
