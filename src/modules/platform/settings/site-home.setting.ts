/**
 * Comportement de la page d'accueil publique (« / ») du mini-site.
 *  - none      : le mini-site s'affiche pour tout le monde ;
 *  - connected : un utilisateur connecté est envoyé sur son espace ;
 *  - always    : la page d'accueil n'est plus affichée (visiteur → connexion).
 */
export const SITE_HOME_REDIRECTS = ['none', 'connected', 'always'] as const;
export type SiteHomeRedirect = (typeof SITE_HOME_REDIRECTS)[number];

export const SITE_DEFAULTS = {
  home_redirect: 'none' as SiteHomeRedirect,
};
