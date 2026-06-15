# Mémoire — gestion-cabinet

- [Enveloppe { data } & tenant en streaming SSE](response-envelope-and-tenant-streaming.md) — pièges transverses : déballer `.data` (TransformInterceptor) et ré-ancrer le contexte tenant ALS en SSE.
- [Système d'aide contextuelle (front)](help-system.md) — registre `app/configs/help` + `HelpButton`, prop `helpKey` sur DashboardTable/GenericDetailPage ; comment étendre aux autres modules.
- [Codes/numéros auto-générés](codes-auto-generation.md) — `code`/`référence`/`numéro` facultatifs front + auto-générés back (`generateEntityCode`) ; numérotation dossier/facture pilotée par les settings cabinet.
