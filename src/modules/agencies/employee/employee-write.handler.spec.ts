import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { EmployeeWriteHandler } from './employee-write.handler';
import { EmployeePosition, EmployeeStatus } from './entities/employee.entity';

describe('EmployeeWriteHandler', () => {
  const createdEmployee = (overrides: Record<string, any> = {}) => ({
    id: 412,
    position: EmployeePosition.COLLABORATEUR,
    status: EmployeeStatus.ACTIVE,
    hireDate: new Date('2026-10-17'),
    employee_number: 'EMP-2026-0412',
    branch: { id: 3 },
    user: {
      id: 412,
      full_name: 'Jean Dupont',
      username: 'jean.dupont',
      email: null,
      password: '$2b$10$hash',
    },
    ...overrides,
  });

  const createHandler = () => {
    const sendCredentials = jest.fn(async () => undefined);
    const employeeService = {
      createEmployeeDeferringCredentials: jest.fn(async () => ({
        employee: createdEmployee(),
        sendCredentials,
      })),
    };
    const employeeRepo = { findOne: jest.fn(async () => null) };
    const handler = Object.create(
      EmployeeWriteHandler.prototype,
    ) as EmployeeWriteHandler;
    // Pas de colonne ni de clé étrangère : execute() parcourt le vrai
    // chemin (résolution, normalisation, validation, insertion) sans BDD.
    const props: Record<string, unknown> = {
      entityName: 'employee',
      entityMeta: { columns: [] },
      fkMap: new Map(),
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
      employeeService,
      employeeRepo,
    };
    for (const [key, value] of Object.entries(props)) {
      Object.defineProperty(handler, key, { value });
    }
    return { handler, employeeService, employeeRepo, sendCredentials };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('« ajoute le collaborateur Jean Dupont » : création minimale par le service RH', async () => {
    const { handler, employeeService, sendCredentials } = createHandler();

    const result = await handler.execute(
      {
        operation: 'INSERT',
        entity: 'employee',
        fields: { full_name: 'Jean Dupont' },
        confidence: 1,
        humanReadable: 'Ajouter le collaborateur Jean Dupont',
      },
      '7',
    );

    // Les identifiants partent après validation du plan, pas ici.
    expect(sendCredentials).not.toHaveBeenCalled();
    expect(result.afterCommit).toBe(sendCredentials);

    expect(employeeService.createEmployeeDeferringCredentials).toHaveBeenCalledWith({
      full_name: 'Jean Dupont',
    });
    expect(result).toMatchObject({
      success: true,
      operation: 'INSERT',
      entityId: 412,
      affected: 1,
      data: {
        id: 412,
        full_name: 'Jean Dupont',
        username: 'jean.dupont',
        position: EmployeePosition.COLLABORATEUR,
        branch_id: 3,
      },
    });
    expect(result.message).toContain('Collaborateur Jean Dupont créé');
    expect(result.message).toContain('jean.dupont');
    // Jamais le compte User complet (hash du mot de passe) dans le résultat.
    expect(JSON.stringify(result.data)).not.toContain('$2b$');
  });

  it('ne transmet jamais mot de passe, rôle, tenant ni statut choisis par le LLM', async () => {
    const { handler, employeeService } = createHandler();

    await handler.execute(
      {
        operation: 'INSERT',
        entity: 'employee',
        fields: {
          full_name: '  Awa Ndiaye ',
          position: EmployeePosition.AVOCAT,
          email: 'awa.ndiaye@cabinet.cm',
          hire_date: '2026-11-02',
          languages: 'Français, Anglais',
          role: 'admin',
          password: 'Secret123!',
          username: 'root',
          tenant_id: 1,
          status: EmployeeStatus.SUSPENDED,
          employee_number: 'EMP-X',
        },
        confidence: 1,
        humanReadable: 'Ajouter Awa Ndiaye',
      },
      '7',
    );

    expect(employeeService.createEmployeeDeferringCredentials).toHaveBeenCalledWith({
      full_name: 'Awa Ndiaye',
      position: EmployeePosition.AVOCAT,
      email: 'awa.ndiaye@cabinet.cm',
      hire_date: '2026-11-02',
      languages: ['Français', 'Anglais'],
    });
  });

  it('exige un nom, comme le formulaire, et accepte l’alias « name »', async () => {
    const { handler } = createHandler();

    const missing = await handler.validateFields(
      { position: EmployeePosition.AVOCAT },
      'INSERT',
    );
    expect(missing.valid).toBe(false);
    expect(missing.errors).toEqual([
      'Le nom du collaborateur est obligatoire (nom et prénom).',
    ]);

    const aliased = await handler.validateFields(
      { name: 'Jean Dupont' },
      'INSERT',
    );
    expect(aliased).toEqual({
      valid: true,
      errors: [],
      transformedFields: { full_name: 'Jean Dupont' },
    });
  });

  it('écarte un email illisible au lieu de bloquer la création', async () => {
    const { handler, employeeService } = createHandler();

    const result = await handler.execute(
      {
        operation: 'INSERT',
        entity: 'employee',
        fields: { full_name: 'Jean Dupont', email: 'jean dupont' },
        confidence: 1,
        humanReadable: '',
      },
      '7',
    );

    expect(employeeService.createEmployeeDeferringCredentials).toHaveBeenCalledWith({
      full_name: 'Jean Dupont',
    });
    expect(result.message).toContain('email ignoré');
  });

  it('ne recrée pas un collaborateur dont l’email existe déjà', async () => {
    const { handler, employeeService, employeeRepo } = createHandler();
    employeeRepo.findOne.mockResolvedValueOnce(
      createdEmployee({
        user: { full_name: 'Jean Dupont', email: 'jean@cabinet.cm' },
      }) as never,
    );

    const result = await handler.execute(
      {
        operation: 'INSERT',
        entity: 'employee',
        fields: { full_name: 'Jean Dupont', email: 'jean@cabinet.cm' },
        confidence: 1,
        humanReadable: '',
      },
      '7',
    );

    expect(employeeService.createEmployeeDeferringCredentials).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, entityId: 412, affected: 0 });
  });

  it('laisse remonter les refus métier du service (quota, profil…)', async () => {
    const { handler, employeeService } = createHandler();
    employeeService.createEmployeeDeferringCredentials.mockRejectedValueOnce(
      new ConflictException('Un utilisateur avec cet email existe déjà') as never,
    );

    await expect(
      handler.execute(
        {
          operation: 'INSERT',
          entity: 'employee',
          fields: { full_name: 'Jean Dupont' },
          confidence: 1,
          humanReadable: '',
        },
        '7',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('présente au LLM une création minimale : full_name requis, fonction et date facultatives', async () => {
    jest
      .spyOn(BaseWriteHandler.prototype, 'getWriteableFieldsSchema')
      .mockResolvedValue([
        { name: 'position', label: 'Fonction', type: 'enum', required: true },
        { name: 'hire_date', label: 'Embauche', type: 'date', required: true },
      ] as any);
    const { handler } = createHandler();

    const schema = await handler.getWriteableFieldsSchema();

    expect(schema).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'full_name', required: true }),
        expect.objectContaining({ name: 'email', required: false }),
        expect.objectContaining({ name: 'position', required: false }),
        expect.objectContaining({ name: 'hire_date', required: false }),
      ]),
    );
    const names = schema.map((f) => f.name);
    expect(names).not.toContain('password');
    expect(names).not.toContain('role');
  });
});
