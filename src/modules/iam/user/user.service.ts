import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { EmailService } from 'src/core/shared/services/email/email.service';
import { CreateEmployeeDto } from 'src/modules/agencies/employee/dto/create-employee.dto';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Repository } from 'typeorm';





import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';


import { InjectRepository } from '@nestjs/typeorm';




import { UserRole } from '../user-role/entities/user-role.entity';
import { UserRolesService } from '../user-role/user-role.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { User } from './entities/user.entity';












@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,    
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    private roleService : UserRolesService,
    private mailerService: EmailService,

    // @Inject(forwardRef(() => UserRolesService))
    // private employeeService : EmployeeService
    
  ) {
        // console.log(forwardRef)
  }

  async create(createUserDto: CreateUserDto , is_strict = true): Promise<UserResponseDto> {
    //await validateDto(CreateUserDto, createUserDto)
    const customer = await this.customerRepository.findOneBy({id:createUserDto.customer_id})
    if (!customer &&  is_strict) {
      throw new NotFoundException('Le compte client est inexistant');
    }
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });
    const existingUserName = await this.userRepository.findOne({
      where: { username: createUserDto.username },
    });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }
    if (existingUserName) {
      throw new ConflictException('Username already exists');
    }
 
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = this.userRepository.create({
      ...createUserDto,
      customer : customer ?? new Customer(),
      password: hashedPassword, 
      status : 1
    });

    const savedUser = await this.userRepository.save(user);
    let dtoE = new CreateEmployeeDto
    const {hire_date, branch_id} = createUserDto
    // await this.employeeService.createEmployee({hire_date, branch_id, user_id : savedUser.id})

    return plainToInstance(UserResponseDto, savedUser);
  }

  async findAll() {
    const users = await this.userRepository
    .createQueryBuilder('user')
    .leftJoinAndSelect('user.customer', 'customer')
    .leftJoinAndSelect('user.employee', 'employee')
    .leftJoinAndSelect('employee.branch', 'branch')
    .leftJoinAndSelect('user.roleAssignments', 'roleAssignment', 'roleAssignment.status = 1')
    .leftJoinAndSelect('roleAssignment.role', 'role', 'role.status = 1')
    .where('user.status = 1')
    .getMany();
    return users.map((user) => plainToInstance(UserResponseDto, user));
  }


  async findOne(id: number): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['customer', 'roleAssignments.role'],
    });
    if (!user) throw new NotFoundException('User not found');

    const activeRoleAssignment = user.roleAssignments.find(
      (assignment) => assignment.role.status === 1,
    );

    user.roleAssignments = activeRoleAssignment ? [activeRoleAssignment] : [];

    return plainToInstance(UserResponseDto, user);
  }

  async findByUsername(username: string): Promise<any | null> {
    const user = await this.userRepository.findOne({
      where: { username },
      relations: ['customer', 'roleAssignments.role'],
    });

    if (!user) throw new NotFoundException('User not found');

    const activeRoleAssignment = user.roleAssignments.find(
      (assignment) => assignment.role.status === 1,
    );

    user.roleAssignments = activeRoleAssignment ? [activeRoleAssignment] : [];
    return user;
  }

  async getUserPermissions(
    userId: number
  ): Promise<any> {
    const role = (await this.findOne(userId))?.role;
    return this.roleService.getPermissionsByCode(role)

  }

  


  async updateRefreshToken(
    userId: number,
    refreshToken: string | undefined,
  ): Promise<void> {
    // Assuming you are using TypeORM or similar ORM
    await this.userRepository.update(userId, {
      refreshToken: refreshToken,
    });
  }
  async update(
    userId: number,
    data,
  ): Promise<void> {
    // Assuming you are using TypeORM or similar ORM
    await this.userRepository.update(userId, data);
  }
  // You might also need a method to get a user by ID
  async findById(userId: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  // And potentially a method to find a user by refresh token
  async findByRefreshToken(refreshToken: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { refreshToken } });
  }

  async getUserRoles(userId: number): Promise<UserRole[]> {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roleAssignments', 'roleAssignments')
      .leftJoinAndSelect('roleAssignments.role', 'role')
      .where('user.id = :userId', { userId })
      .select(['role.code', 'role.name'])
      .getRawMany();
  }

  async remove(id: number): Promise<void> {
    await this.userRepository.delete(id);
  }

  async descativeUser(id: number): Promise<any> {
    await this.userRepository.update(id, { status: 0 });
    return
  }
  async activateUser(id: number): Promise<any> {
    await this.userRepository.update(id, { status: 1 });
    return
  }


    // Génère un mot de passe temporaire (alphanum + caractères spéciaux)
  private generate_temp_password(length = 12): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%*?';
    let pwd = '';
    for (let i = 0; i < length; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  /**
  * Réinitialise le mot de passe d'un utilisateur et envoie le nouveau par email.
  * - On accepte soit un id, soit un email pour identifier l'utilisateur.
  * - Le mot de passe est hashé en base et le clair est envoyé par email.
  * - À utiliser comme mot de passe temporaire (l'utilisateur devra le changer après connexion).
  */
  async send_new_password(params: { id?: number; email?: string }): Promise<{ message: string }> {
    // 1) Vérifications de base
    if (!params?.id && !params?.email) {
      throw new NotFoundException('Veuillez fournir un identifiant (id) ou un email utilisateur.');
    }

    // 2) Récupération utilisateur
    const user = await this.userRepository.findOne({
      where: params.id ? { id: params.id } : { email: params.email },
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    if (!user.email) {
      throw new NotFoundException("L'utilisateur n'a pas d'email renseigné");
    }

    // 3) Génération + hash
    const plain_password = this.generate_temp_password(12);
    const hashed_password = await bcrypt.hash(plain_password, 10);

    // 4) Sauvegarde en base
    await this.userRepository.update(user.id, { password: hashed_password });

    const html =
    `<p>Bonjour,</p>
    <p>Votre mot de passe a été réinitialisé.</p>
    <p><strong>Nouveau mot de passe temporaire :</strong> ${plain_password}</p>
    <p>Par mesure de sécurité, merci de le changer dès votre prochaine connexion.</p>
    <p>— Support</p>`
    await this.mailerService.sendPasswordResetEmail(user.email, html)
    /*await this.mailerService.sendMail({
      to: user.email,
      subject: 'Votre nouveau mot de passe',
      text:
    `Bonjour,

    Votre mot de passe a été réinitialisé.
    Nouveau mot de passe temporaire : ${plain_password}

    Par mesure de sécurité, merci de le changer dès votre prochaine connexion.

    — Support`,
        html:
    `<p>Bonjour,</p>
    <p>Votre mot de passe a été réinitialisé.</p>
    <p><strong>Nouveau mot de passe temporaire :</strong> ${plain_password}</p>
    <p>Par mesure de sécurité, merci de le changer dès votre prochaine connexion.</p>
    <p>— Support</p>`,
      });*/

    // 6) Retour clair en français
    return { message: 'Mot de passe réinitialisé et envoyé par email.' };
  }

}