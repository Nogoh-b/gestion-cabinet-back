# IA par souscription

Dans **Plateforme → Intelligence artificielle**, Xiaomi MiMo utilise `MIMO_API_KEY` et l’URL `https://api.xiaomimimo.com/v1` (surcharge possible : `MIMO_BASE_URL`). Les clés des fournisseurs intégrés restent dans l’environnement serveur. Le catalogue des modèles de conversation est actualisé via `/models`, avec les cinq modèles documentés comme repli. Les modèles ASR/TTS utilisent des endpoints audio distincts et ne sont pas proposés comme moteur de conversation.

Dans **Plateforme → Plans → Modifier → Modèles IA du forfait** :

- Attribuer un moteur par défaut ou hériter du défaut plateforme.
- Autoriser facultativement un choix parmi les couples fournisseur/modèle cochés.
- Autoriser indépendamment les configurations personnelles du cabinet.

Sans autorisation explicite, aucun choix ni ajout personnel n’est possible. Les exceptions attribuées directement par la plateforme restent prioritaires. Le modèle attribué ne change pas lorsque l’utilisateur change le niveau de réflexion du chat.

L’administrateur du cabinet retrouve ses options dans **Administration → IA**. Les API `PUT/DELETE /api/ai-admin/selection` et `POST/PUT/DELETE /api/ai-admin/providers` vérifient le tenant, le rôle et les droits du forfait côté serveur. Les clés personnelles sont chiffrées avec `AI_CONFIG_ENCRYPTION_KEY` (ou `JWT_SECRET`) et ne sont jamais renvoyées par l’API. Le retrait d’une autorisation révoque les anciens choix lors de la résolution du moteur ; les configurations personnelles restent stockées pour un éventuel retour à un forfait compatible.

Priorité : exception plateforme du cabinet → choix cabinet autorisé → moteur du forfait → défaut plateforme → environnement serveur. Les anciens enregistrements sans `selection_origin` sont considérés comme des exceptions plateforme pour préserver le comportement existant.

## Mise en service

1. Appliquer la migration `1792800000000-PlanAiPolicy` via la procédure habituelle de migration (`npm run migration:run`). Elle ajoute uniquement `plans.ai_policy` et accepte une colonne déjà présente.
2. Renseigner `MIMO_API_KEY` sur le serveur et redémarrer le backend.
3. Configurer les règles des forfaits depuis la console plateforme. Les anciens forfaits restent en gestion plateforme, sans choix ni ajout personnel.

Les modifications des règles d’un forfait et des paramètres IA invalident le cache local du routeur. Le cache de configuration a une durée maximale de 30 secondes pour les autres changements et instances.
