import { describe, expect, it, jest } from '@jest/globals';
import * as bcrypt from 'bcrypt';
import { EmployeeService } from './employee.service';

/**
 * Envoi des identifiants à la création d'un collaborateur : immédiat pour le
 * formulaire RH (`createEmployee`), différé pour le chemin IA
 * (`createEmployeeDeferringCredentials`, envoyé après validation du plan).
 */
function createService() {
  const userRepo = {
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (user: any) => ({ ...user, id: 412 })),
    findOne: jest.fn(async () => null),
  };
  const employeeRepository = {
    count: jest.fn(async () => 3),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (employee: any) => employee),
  };
  const accessProfileQuery: any = {
    where: () => accessProfileQuery,
    andWhere: () => accessProfileQuery,
    getOne: async () => ({ id: 5, code: 'collaborateur' }),
  };
  const mailService = {
    sendDirect: jest.fn(async () => undefined),
    sendWelcomeWithPasswordEmail: jest.fn(async () => undefined),
  };
  const mailTemplateService = {
    renderOrCreateSystemDefault: jest.fn(async (_code: string, context: any) => ({
      subject: 'Vos identifiants',
      html: `<p>${context.email} / ${context.tempPassword}</p>`,
    })),
  };
  const service = Object.create(EmployeeService.prototype) as EmployeeService;
  const props: Record<string, unknown> = {
    planQuotaService: { checkLimit: jest.fn(async () => undefined) },
    branchRepository: { findOne: jest.fn(async () => ({ id: 3, status: 1 })) },
    userRoleRepository: { createQueryBuilder: () => accessProfileQuery },
    repository: { findOne: jest.fn(async () => null) },
    userRepo,
    userRoleAssignmentRepository: {
      create: jest.fn((data: any) => data),
      save: jest.fn(async (data: any) => data),
    },
    employeeRepository,
    mailService,
    mailTemplateService,
  };
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(service, key, { value });
  }
  return { service, mailService, mailTemplateService, employeeRepository, userRepo };
}

const dto = { full_name: 'Jean Dupont', email: 'jean.dupont@cabinet.com' } as any;

describe('EmployeeService — identifiants du nouveau collaborateur', () => {
  it('formulaire RH : createEmployee envoie les identifiants tout de suite, une fois', async () => {
    const { service, mailService } = createService();

    const employee = await service.createEmployee(dto);

    expect(employee).toMatchObject({ id: 412 });
    expect(mailService.sendDirect).toHaveBeenCalledTimes(1);
    expect(mailService.sendDirect).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'jean.dupont@cabinet.com', subject: 'Vos identifiants' }),
    );
  });

  it('chemin IA : rien ne part avant sendCredentials, puis le mot de passe enregistré', async () => {
    const { service, mailService, mailTemplateService, employeeRepository, userRepo } =
      createService();

    const { employee, sendCredentials } =
      await service.createEmployeeDeferringCredentials(dto);

    expect(employeeRepository.save).toHaveBeenCalledTimes(1);
    expect(employee).toMatchObject({ id: 412 });
    expect(mailService.sendDirect).not.toHaveBeenCalled();

    await sendCredentials();

    expect(mailService.sendDirect).toHaveBeenCalledTimes(1);
    const { tempPassword } = mailTemplateService.renderOrCreateSystemDefault.mock.calls[0][1];
    const savedUser = userRepo.save.mock.calls[0][0] as any;
    expect(await bcrypt.compare(tempPassword, savedUser.password)).toBe(true);
  });

  it('sans email : sendCredentials n’envoie rien', async () => {
    const { service, mailService } = createService();

    const { sendCredentials } = await service.createEmployeeDeferringCredentials({
      full_name: 'Jean Dupont',
    } as any);
    await sendCredentials();

    expect(mailService.sendDirect).not.toHaveBeenCalled();
    expect(mailService.sendWelcomeWithPasswordEmail).not.toHaveBeenCalled();
  });
});
