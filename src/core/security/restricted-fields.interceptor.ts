import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  hiddenResponseFields,
  redactRestrictedFields,
} from './restricted-fields';

/**
 * Retire des réponses HTTP les champs financiers que le rôle de l'appelant ne
 * permet pas de voir (budget et frais d'un dossier, salaire et taux horaire
 * d'un employé, commissions d'un apporteur…) — voir restricted-fields.ts.
 *
 * Enregistré en APP_INTERCEPTOR, donc AUTOUR du ClassSerializerInterceptor
 * (main.ts) : il reçoit le JSON final, après les @Transform des DTO, et
 * couvre aussi les relations imbriquées (audience.dossier, facture.dossier…)
 * quelle que soit la route qui les renvoie. Masquer ces champs dans l'interface
 * ne suffit pas : c'est ici que la donnée cesse de sortir.
 */
@Injectable()
export class RestrictedFieldsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const hidden = hiddenResponseFields(context.switchToHttp().getRequest()?.user);
    if (!hidden.everywhere.size && !hidden.onDossier.size) return next.handle();

    return next.handle().pipe(map((body) => redactRestrictedFields(body, hidden)));
  }
}
