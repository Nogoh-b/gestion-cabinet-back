import { User as IamUser } from 'src/modules/iam/user/entities/user.entity';

declare global {
  namespace Express {
    interface Request {
      user?: IamUser; // Utilisez votre entité User réelle
    }
  }
}