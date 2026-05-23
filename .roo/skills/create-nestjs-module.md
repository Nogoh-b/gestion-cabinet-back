---
name: create-nestjs-module
description: Générer un module NestJS complet pour le projet gestion-cabinet-back en suivant les patterns établis (entité, DTOs, service, controller, write handler, permissions, notifications).
---

# Skill : Créer un module NestJS — gestion-cabinet-back

Ce skill décrit la procédure pour créer un nouveau module NestJS dans le projet [`gestion-cabinet-back`](.), un ERP pour cabinet d'avocats basé sur **NestJS 11 + TypeORM + MySQL + Redis/Bull + Socket.IO + AI Database (LangChain/OpenAI)**.

---

## 1. Structure de répertoire

```
src/modules/{module-name}/
├── {module-name}.module.ts
├── {module-name}.controller.ts
├── {module-name}.service.ts
├── {module-name}-stats.service.ts          # Optionnel
├── {module-name}-write.handler.ts          # Pour AI Database
├── entities/
│   └── {entity-name}.entity.ts
├── dto/
│   ├── create-{entity-name}.dto.ts
│   ├── update-{entity-name}.dto.ts
│   ├── search-{entity-name}.dto.ts
│   └── response-{entity-name}.dto.ts
├── enums/
│   └── {module-name}.enum.ts
└── seeder/
    └── {module-name}.seeder.ts             # Optionnel
```

---

## 2. Enum

Créer dans [`src/modules/{module-name}/enums/{module-name}.enum.ts`](src/modules).

Utiliser des `enum` TypeScript avec des valeurs en string snake_case.

```typescript
export enum MyEntityStatus {
  PENDING  = 'pending',
  ACTIVE   = 'active',
  INACTIVE = 'inactive',
}
```

---

## 3. Entité

Créer dans [`src/modules/{module-name}/entities/{entity-name}.entity.ts`](src/modules).

### Règles :
- Étendre [`BaseEntity`](src/core/entities/baseEntity.ts) (ou utiliser `@Entity()` directement)
- Ajouter les décorateurs [`@BusinessTable`](src/core/decorators/business-metadata.decorator.ts:25) et [`@BusinessColumn`](src/core/decorators/business-metadata.decorator.ts:31) pour l'intégration AI Database
- Utiliser `@PrimaryGeneratedColumn()` pour l'ID
- Utiliser `@CreateDateColumn()` / `@UpdateDateColumn()` pour les timestamps
- Pour les relations, utiliser `@ManyToOne` / `@OneToMany` / `@ManyToMany` avec `@JoinColumn`

### Exemple :
```typescript
@Entity('my_entities')
@BusinessTable({ name: 'my_entities', description: 'Description du module' })
export class MyEntity extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  @BusinessColumn({ label: 'Nom' })
  name: string;

  @Column({ type: 'enum', enum: MyEntityStatus, default: MyEntityStatus.PENDING })
  @BusinessColumn({ label: 'Statut' })
  status: MyEntityStatus;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'employee_id' })
  @BusinessColumn({ label: 'Employé assigné' })
  employee: Employee;
  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

---

## 4. DTOs

Créer dans [`src/modules/{module-name}/dto/`](src/modules).

### 4.1 Create DTO
- Utiliser `class-validator` decorators : `@IsNotEmpty()`, `@IsString()`, `@IsOptional()`, `@IsEnum()`, `@IsInt()`, `@IsDateString()`, `@MaxLength()`, `@IsArray()`, `@IsBoolean()`
- Tous les champs obligatoires doivent avoir `@IsNotEmpty()`
- Les champs optionnels doivent avoir `@IsOptional()`

### 4.2 Update DTO
- Mêmes champs que Create mais tous optionnels
- Ajouter `status` si applicable

### 4.3 Search DTO
- Inclure les filtres pertinents (dates, statuts, relations)
- Inclure `page` et `limit` pour la pagination
- Inclure `search?: string` pour la recherche plein texte

### 4.4 Response DTO
- Utiliser `@Expose()` et `@Transform()` de `class-transformer`
- Exposer les noms des relations plutôt que les IDs bruts

---

## 5. Service

Créer dans [`src/modules/{module-name}/{module-name}.service.ts`](src/modules).

### Pattern standard :
```typescript
@Injectable()
export class MyEntityService {
  constructor(
    @InjectRepository(MyEntity)
    private readonly repo: Repository<MyEntity>,
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
    private readonly socketGateway: MainGateway,
  ) {}

  async create(dto: CreateMyEntityDto, userId: number): Promise<ResponseMyEntityDto> { ... }
  async findAll(query: SearchMyEntityDto): Promise<PaginatedResult<ResponseMyEntityDto>> { ... }
  async findOne(id: number): Promise<ResponseMyEntityDto> { ... }
  async update(id: number, dto: UpdateMyEntityDto, userId: number): Promise<ResponseMyEntityDto> { ... }
  async remove(id: number, userId: number): Promise<void> { ... }
}
```

### Notifications :
- Utiliser [`NotificationService.createBulk()`](src/modules/notification/notification.service.ts:88) pour les notifications push
- Ajouter les nouveaux types dans [`NotificationType`](src/modules/notification/enum/notification-type.enum.ts:2)

### Rappels / Cron :
- Utiliser `@Cron(CronExpression.EVERY_MINUTE)` de `@nestjs/schedule`
- Utiliser [`MailService.create()`](src/core/shared/services/email/email.service.ts:22) avec `scheduledAt` pour les emails programmés

### Socket temps réel :
- Utiliser [`MainGateway.sendToUser()`](src/core/shared/services/socket/main.gateway.ts:783) pour les notifications individuelles
- Utiliser [`MainGateway.sendToRoom()`](src/core/shared/services/socket/main.gateway.ts:795) pour les notifications de groupe

---

## 6. Controller

Créer dans [`src/modules/{module-name}/{module-name}.controller.ts`](src/modules).

### Pattern standard :
```typescript
@ApiTags('My Entity')
@Controller('my-entities')
export class MyEntityController {
  constructor(private readonly service: MyEntityService) {}

  @Post()
  @Permissions('create_my_entity')
  async create(@Body() dto: CreateMyEntityDto, @CurrentUser() user: UserPayload) { ... }

  @Get()
  @Permissions('view_my_entities')
  async findAll(@Query() query: SearchMyEntityDto) { ... }

  @Get(':id')
  @Permissions('view_my_entities')
  async findOne(@Param('id', ParseIntPipe) id: number) { ... }

  @Patch(':id')
  @Permissions('edit_my_entity')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMyEntityDto, @CurrentUser() user: UserPayload) { ... }

  @Delete(':id')
  @Permissions('delete_my_entity')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UserPayload) { ... }
}
```

### Décorateurs à utiliser :
- `@ApiTags()` — Swagger
- `@Permissions()` — Vérification des permissions (guard déjà global)
- `@CurrentUser()` — Récupère l'utilisateur connecté (type [`UserPayload`](src/core/shared/interfaces/user-payload.interface.ts))
- `@Public()` — Si l'endpoint est public
- `ParseIntPipe` — Pour valider les IDs numériques

---

## 7. Module

Créer dans [`src/modules/{module-name}/{module-name}.module.ts`](src/modules).

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([MyEntity]),
    // autres modules requis
  ],
  controllers: [MyEntityController],
  providers: [MyEntityService, MyEntityWriteHandler],
  exports: [MyEntityService],
})
export class MyEntityModule {}
```

Puis enregistrer dans [`src/app.module.ts`](src/app.module.ts:71) :
```typescript
import { MyEntityModule } from './modules/{module-name}/{module-name}.module';

@Module({
  imports: [
    // ...
    MyEntityModule,
  ],
})
```

---

## 8. Write Handler (AI Database)

Créer dans [`src/modules/{module-name}/{module-name}-write.handler.ts`](src/modules).

### Pattern :
```typescript
@Injectable()
export class MyEntityWriteHandler extends BaseWriteHandler {
  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    @InjectRepository(MyEntity)
    private readonly repo: Repository<MyEntity>,
  ) {
    super('my_entities', dataSource, schemaMetadata, entityResolver);
  }

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    const fields = await super.getWriteableFieldsSchema();
    // Enrichir les descriptions pour l'IA
    return fields;
  }

  async validateFields(fields, operation): Promise<ValidationResult> {
    const errors: string[] = [];
    // Validations métier
    return { valid: errors.length === 0, errors, transformedFields: fields };
  }

  protected async doInsert(fields, userId): Promise<WriteResult> {
    // Résoudre les relations via entityResolver.resolve()
    return super.doInsert(fields, userId);
  }
}
```

### Enregistrement :
Ajouter dans [`src/config/ai-database/database-tables.config.ts`](src/config/ai-database/database-tables.config.ts) la table et son handler.

---

## 9. Permissions

### 9.1 Ajouter dans [`Permission`](src/core/enums/permission.enum.ts:6)
```typescript
VIEW_MY_ENTITIES  = 'view_my_entities',
CREATE_MY_ENTITY  = 'create_my_entity',
EDIT_MY_ENTITY    = 'edit_my_entity',
DELETE_MY_ENTITY  = 'delete_my_entity',
```

### 9.2 Ajouter dans [`role.seeder.ts`](src/core/auth/seeders/role.seeder.ts:10)
Ajouter les permissions dans la config des rôles concernés (admin, avocat, secretaire, etc.).

### 9.3 Lancer le seeder
```bash
npx ts-node src/main.seeder.ts
```

---

## 10. Notifications

Ajouter les nouveaux types dans [`NotificationType`](src/modules/notification/enum/notification-type.enum.ts:2) :
```typescript
MY_ENTITY_CREATED  = 'my_entity_created',
MY_ENTITY_UPDATED  = 'my_entity_updated',
MY_ENTITY_REMINDER = 'my_entity_reminder',
```

---

## 11. Migration

Générer la migration TypeORM après avoir créé l'entité :
```bash
# La migration est générée automatiquement au démarrage si synchronize: true
# OU via la CLI TypeORM
npx typeorm migration:generate src/migrations/CreateMyEntityTable -d src/data-source.ts
```

---

## 12. Résumé des fichiers de référence

| Fichier | Utilité |
|---|---|
| [`Permission`](src/core/enums/permission.enum.ts:6) | Énumération des permissions |
| [`UserRole`](src/core/enums/user-role.enum.ts:1) | Rôles utilisateur |
| [`NotificationType`](src/modules/notification/enum/notification-type.enum.ts:2) | Types de notification |
| [`NotificationService`](src/modules/notification/notification.service.ts:15) | Service de notification push |
| [`MailService`](src/core/shared/services/email/email.service.ts:22) | Service d'email avec `scheduledAt` |
| [`MainGateway`](src/core/shared/services/socket/main.gateway.ts:783) | Gateway Socket.IO |
| [`BaseWriteHandler`](src/core/ai-database/write/base-write-handler.ts:102) | Classe de base pour write handlers |
| [`BusinessTable`](src/core/decorators/business-metadata.decorator.ts:25) | Décorateur table AI Database |
| [`BusinessColumn`](src/core/decorators/business-metadata.decorator.ts:31) | Décorateur colonne AI Database |
| [`role.seeder.ts`](src/core/auth/seeders/role.seeder.ts:10) | Seeder des rôles et permissions |
| [`app.module.ts`](src/app.module.ts:71) | Module racine de l'application |
| [`UserPayload`](src/core/shared/interfaces/user-payload.interface.ts) | Interface de l'utilisateur connecté |
| [`database-tables.config.ts`](src/config/ai-database/database-tables.config.ts) | Configuration des tables AI Database |

---

## 13. Exemple concret — Module Appointment

Voir le plan complet dans [`plans/appointment-module-plan.md`](plans/appointment-module-plan.md) pour un exemple d'implémentation complète d'un module suivant ces patterns.
