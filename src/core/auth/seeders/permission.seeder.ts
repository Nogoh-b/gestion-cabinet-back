import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Permission } from 'src/modules/iam/permission/entities/permission.entity';
import { Repository } from 'typeorm';

@Injectable()
export class PermissionSeeder {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  async seed() {
    const permissions = [
    // ==================== IAM (Gestion des accès) ====================
    { code: 'CREATE_USER', description: 'Créer un nouvel utilisateur' },
    { code: 'VIEW_USER', description: 'Voir les détails d\'un utilisateur' },
    { code: 'EDIT_USER', description: 'Modifier un utilisateur' },
    { code: 'DELETE_USER', description: 'Supprimer un utilisateur' },
    { code: 'RESET_USER_PASSWORD', description: 'Réinitialiser un mot de passe utilisateur' },
    { code: 'LOCK_UNLOCK_USER', description: 'Bloquer/Débloquer un utilisateur' },

    { code: 'CREATE_ROLE', description: 'Créer un rôle' },
    { code: 'VIEW_ROLE', description: 'Voir la liste des rôles' },
    { code: 'EDIT_ROLE', description: 'Modifier un rôle' },
    { code: 'DELETE_ROLE', description: 'Supprimer un rôle' },
    { code: 'ASSIGN_PERMISSIONS_TO_ROLE', description: 'Attribuer des permissions à un rôle' },
    { code: 'ASSIGN_ROLES_TO_USER', description: 'Attribuer des rôles à un utilisateur' },

    { code: 'VIEW_AUDIT_LOGS', description: 'Consulter les logs d\'activité' },
    { code: 'MANAGE_2FA', description: 'Gérer l\'authentification à deux facteurs' },


    { code: 'CREATE_TYPE_CUSTOMER', description: '' },
    { code: 'GET_TYPE_CUSTOMER', description: '' },
    { code: 'GET_TYPE_CUSTOMER', description: '' },
    { code: 'UPDATE_TYPE_CUSTOMER', description: '' },
    { code: 'ASSIGN_TYPE_CUSTOMER', description: '' },
    { code: 'GET_TYPE_CUSTOMER', description: '' },

    { code: 'CREATE_DOCUMENT_TYPE', description: '' },
    { code: 'VIEW_DOCUMENT_TYPE', description: '' },
    { code: 'VIEW_DOCUMENT_TYPE', description: '' },
    { code: 'EDIT_DOCUMENT_TYPE', description: '' },
    { code: 'DELETE_DOCUMENT_TYPE', description: '' },


    { code: 'MANAGE_LOCATION', description: 'Gestion des locations' },
    { code: 'MANAGE_ROLE', description: 'Gestion des locations' },

    // ==================== Gestion des Clients ====================
    { code: 'CREATE_CUSTOMER', description: 'Créer un nouveau client' },
    { code: 'VIEW_CUSTOMER', description: 'Voir les informations d\'un client' },
    { code: 'EDIT_CUSTOMER', description: 'Modifier un client' },
    { code: 'DELETE_CUSTOMER', description: 'Supprimer un client (archivage)' },
    { code: 'VERIFY_CUSTOMER_KYC', description: 'Valider l\'identité client (KYC)' },
    { code: 'BLOCK_UNBLOCK_CUSTOMER', description: 'Bloquer/Débloquer un client' },

    // ==================== Comptes Bancaires ====================
    { code: 'CREATE_ACCOUNT', description: 'Ouvrir un compte bancaire' },
    { code: 'VIEW_ACCOUNT', description: 'Voir les détails d\'un compte' },
    { code: 'EDIT_ACCOUNT', description: 'Modifier un compte (solde, statut, etc.)' },
    { code: 'CLOSE_ACCOUNT', description: 'Fermer un compte' },
    { code: 'FREEZE_UNFREEZE_ACCOUNT', description: 'Geler/Dégeler un compte' },

    // ==================== Transactions ====================
    { code: 'PROCESS_TRANSACTION', description: 'Effectuer une transaction' },
    { code: 'APPROVE_TRANSACTION', description: 'Approuver une transaction (si validation requise)' },
    { code: 'REVERSE_TRANSACTION', description: 'Annuler une transaction' },
    { code: 'VIEW_TRANSACTION_HISTORY', description: 'Consulter l\'historique des transactions' },

    // ==================== Agences (Branches) ====================
    { code: 'CREATE_BRANCH', description: 'Créer une nouvelle agence' },
    { code: 'VIEW_BRANCH', description: 'Voir les détails d\'une agence' },
    { code: 'EDIT_BRANCH', description: 'Modifier une agence' },
    { code: 'DELETE_BRANCH', description: 'Supprimer une agence' },
    { code: 'MANAGE_BRANCH_SCHEDULE', description: 'Gérer les horaires d\'ouverture' },

    // ==================== Employés ====================
    { code: 'CREATE_EMPLOYEE', description: 'Ajouter un employé' },
    { code: 'VIEW_EMPLOYEE', description: 'Voir les informations employé' },
    { code: 'EDIT_EMPLOYEE', description: 'Modifier un employé' },
    { code: 'DELETE_EMPLOYEE', description: 'Supprimer un employé' },

    // ==================== Localisations ====================
    /*{ code: 'CREATE_LOCATION', description: 'Ajouter un pays/ville' },
    { code: 'VIEW_LOCATION', description: 'Voir les localisations' },
    { code: 'EDIT_LOCATION', description: 'Modifier une localisation' },
    { code: 'DELETE_LOCATION', description: 'Supprimer une localisation' },*/

    // ==================== Permissions Spéciales ====================
    { code: 'SUPER_ADMIN', description: 'Accès total au système' ,canChange: 0  },
    { code: 'AUDIT_SYSTEM', description: 'Auditer toutes les actions' ,canChange: 0  },
    { code: 'EXPORT_DATA', description: 'Exporter des données (rapports)' }
    ];

    for (const perm of permissions) {
        console.log(`Creating permission: ${perm.code}`);
        // Check if the permission already exists
      const exists = await this.permissionRepo.findOne({ where: { code: perm.code } });
      if (!exists) {
        await this.permissionRepo.save(this.permissionRepo.create(perm));
      }
    }
  }
}