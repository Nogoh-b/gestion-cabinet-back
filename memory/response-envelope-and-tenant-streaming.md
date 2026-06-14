---
name: response-envelope-and-tenant-streaming
description: Deux pièges transverses back/front — enveloppe { data } et contexte tenant en streaming SSE
metadata:
  type: project
---

Deux pièges transverses du projet gestion-cabinet (back NestJS + front Next.js), rencontrés le 2026-06-13 :

1. **Enveloppe de réponse `{ data, message, statusCode }`** : un `TransformInterceptor` global (core.module) emballe TOUTES les réponses HTTP via `ResponseFormatter.format()`. Les appels front via l'**axios client** sont souvent dé-emballés par les services (`.data`), mais les appels via `authenticatedApiClient` (fetch) renvoient le JSON **brut** — il faut donc déballer `.data` soi-même. Bug typique : un service qui type le retour comme `T` sans déballer → tous les champs `undefined` (ex: switches user-settings désynchronisés).

2. **Contexte tenant (`AsyncLocalStorage`) perdu en streaming SSE** : le tenant est posé par `TenantResolverMiddleware` (header `x-tenant-code`) puis `TenantInterceptor` (depuis `request.user.tenantId` du JWT). Mais l'interceptor enveloppe un `Observable` — pour un endpoint SSE long (`@Res()`), la propagation de l'ALS sur tout le corps async n'est pas garantie. Solution : ré-ancrer explicitement `tenantContext.run(tenantId, () => …)` dans le contrôleur, tenant pris du JWT. Voir [[ai-search-tenant-fix]]. Le filtrage tenant des `repo.find` (patch `Repository.prototype`) et de l'injection SQL (`injectTenantConditions`) dépend de `getCurrentTenantId()`/`hasActiveTenant()` → inutile si l'ALS est perdu.

Le fetch SSE front (`conversation-bot.service.askStream`) doit aussi envoyer manuellement `x-tenant-code` (l'axios client ne l'ajoute que sur ses propres requêtes).
