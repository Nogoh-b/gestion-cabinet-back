// seeders/chat-group-conversation.seeder.ts
import { DataSource, Repository } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Conversation } from '../entities/conversation.entity';
import { Employee, EmployeeStatus } from 'src/modules/agencies/employee/entities/employee.entity';

export default class ChatGroupConversationSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager
  ): Promise<any> {
    const conversationRepository = dataSource.getRepository(Conversation);
    const employeeRepository = dataSource.getRepository(Employee);

    // Vérifier si la conversation de groupe existe déjà
    const existingConversation = await conversationRepository.findOne({
      where: { name: 'Cabinet - Tous les collaborateurs', isGroup: true },
      relations: ['participants']
    });

    if (existingConversation) {
      console.log('⚠️ La conversation de groupe existe déjà :', existingConversation.name);
      console.log(`   Participants actuels : ${existingConversation.participants?.length || 0}`);
      
      // Optionnel : Mettre à jour les participants
      await this.updateParticipants(existingConversation, employeeRepository, conversationRepository);
      return;
    }

    // Récupérer tous les employés actifs
    const activeEmployees = await employeeRepository.find({
      where: { status: EmployeeStatus.ACTIVE },
      relations: ['user']
    });

    if (activeEmployees.length === 0) {
      console.log('⚠️ Aucun employé actif trouvé. La conversation de groupe ne sera pas créée.');
      return;
    }

    console.log(`📊 ${activeEmployees.length} employés actifs trouvés :`);
    activeEmployees.forEach(emp => {
      console.log(`   - ${emp.full_name} (${emp.position})`);
    });

    // Créer la conversation de groupe
    const groupConversation = conversationRepository.create();
    groupConversation.name = 'Cabinet - Tous les collaborateurs';
    groupConversation.isGroup = true;
    groupConversation.participants = activeEmployees;
    groupConversation.createdAt = new Date();
    groupConversation.lastMessageAt = new Date();
    groupConversation.lastMessageData = undefined;

    await conversationRepository.save(groupConversation);
    
    console.log('\n✅ Conversation de groupe créée avec succès !');
    console.log(`   Nom: ${groupConversation.name}`);
    console.log(`   Participants: ${activeEmployees.length}`);
    console.log(`   ID: ${groupConversation.id}`);
  }

  private async updateParticipants(
    conversation: Conversation,
    employeeRepository: Repository<Employee>,
    conversationRepository: Repository<Conversation>
  ): Promise<void> {
    // Récupérer tous les employés actifs actuels
    const activeEmployees = await employeeRepository.find({
      where: { status: EmployeeStatus.ACTIVE },
      relations: ['user']
    });

    const currentParticipantIds = new Set(conversation.participants?.map(p => p.id) || []);
    const newParticipantIds = new Set(activeEmployees.map(e => e.id));

    // Trouver les employés à ajouter
    const employeesToAdd = activeEmployees.filter(e => !currentParticipantIds.has(e.id));
    
    // Trouver les employés à retirer (ceux qui ne sont plus actifs)
    const employeesToRemove = conversation.participants?.filter(p => !newParticipantIds.has(p.id)) || [];

    if (employeesToAdd.length === 0 && employeesToRemove.length === 0) {
      console.log('   ✅ Aucune mise à jour nécessaire, tous les participants sont à jour.');
      return;
    }

    // Mettre à jour les participants
    if (employeesToAdd.length > 0) {
      console.log(`   ➕ Ajout de ${employeesToAdd.length} nouveaux participants :`);
      employeesToAdd.forEach(emp => {
        console.log(`      - ${emp.full_name} (${emp.position})`);
      });
      conversation.participants = [...(conversation.participants || []), ...employeesToAdd];
    }

    if (employeesToRemove.length > 0) {
      console.log(`   ➖ Retrait de ${employeesToRemove.length} participants inactifs :`);
      employeesToRemove.forEach(emp => {
        console.log(`      - ${emp.full_name} (${emp.position})`);
      });
      conversation.participants = conversation.participants?.filter(
        p => !employeesToRemove.some(r => r.id === p.id)
      ) || [];
    }

    await conversationRepository.save(conversation);
    console.log('   ✅ Participants mis à jour avec succès !');
  }
}