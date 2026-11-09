import { BadRequestException } from '@nestjs/common';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { AskQuestionDto } from '../../ai-database/dto/ask-question.dto';
import { CreateDocumentCustomerDto } from '../../../modules/documents/document-customer/dto/create-document-customer.dto';
import {
  CreateDocumentFromCotiDto,
  DocTypeNameOnline,
} from '../../../modules/documents/document-customer/dto/create-document-from-coti.dto';
import { ApiProperty } from '@nestjs/swagger';
import { SearchDocumentCustomerDto } from '../../../modules/documents/document-customer/dto/document-customer-search.dto';
import { RequestValidationPipe } from './request-validation.pipe';

class SearchOnlyDto {
  @IsOptional()
  @IsString()
  search?: string;
}

class EmailDto {
  @IsEmail()
  email!: string;
}

describe('RequestValidationPipe', () => {
  const pipe = new RequestValidationPipe();

  it('garde tous les paramètres de query (filtres non décorés compris)', async () => {
    const result = await pipe.transform(
      { search: 'client', page: '1', limit: '5', dossier_id: '20' },
      { type: 'query', metatype: SearchOnlyDto, data: undefined },
    );

    expect(result).toMatchObject({ search: 'client', page: '1', limit: '5', dossier_id: '20' });
  });

  it('garde le filtre dossier des documents (déclaré par @ApiProperty seul)', async () => {
    const result = await pipe.transform(
      { dossier_id: '20', page: '1' },
      { type: 'query', metatype: SearchDocumentCustomerDto, data: undefined },
    );

    expect(Number((result as any).dossier_id)).toBe(20);
  });

  it('garde dans un body les champs déclarés par @ApiProperty seul', async () => {
    class SwaggerOnlyDto {
      @ApiProperty() note?: string;
      @IsOptional() @IsString() search?: string;
    }
    const result = await pipe.transform(
      { note: 'à garder', search: 'x', id: 4 },
      { type: 'body', metatype: SwaggerOnlyDto, data: undefined },
    );

    expect(result).toEqual({ note: 'à garder', search: 'x' });
  });

  it('retire les propriétés inconnues d’un body sans les refuser', async () => {
    const result = await pipe.transform(
      { id: 3, code: 'abcd', search: 'client', unexpected: true },
      { type: 'body', metatype: SearchOnlyDto, data: undefined },
    );

    expect(result).toEqual({ search: 'client' });
  });

  it('refuse toujours une valeur invalide pour un champ déclaré', async () => {
    await expect(
      pipe.transform(
        { email: 'pas-un-email', id: 3 },
        { type: 'body', metatype: EmailDto, data: undefined },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepte le DTO multipart de création documentaire avec le fichier géré par Multer', async () => {
    const result = await pipe.transform(
      {
        document_type_id: '256',
        dossier_id: '129',
        name: 'jjh',
        category_id: '226',
        stage_visit_id: '17c4f048-98e5-4c5e-94de-4f44228f21fa',
      },
      {
        type: 'body',
        metatype: CreateDocumentCustomerDto,
        data: undefined,
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        document_type_id: 256,
        dossier_id: 129,
        category_id: 226,
      }),
    );
  });

  it('accepte les métadonnées KYC multipart sans confondre le fichier Multer avec le body', async () => {
    const result = await pipe.transform(
      {
        document_type_name: DocTypeNameOnline.FRONT_CNI,
        customer_id: '12',
      },
      {
        type: 'body',
        metatype: CreateDocumentFromCotiDto,
        data: undefined,
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        document_type_name: DocTypeNameOnline.FRONT_CNI,
        customer_id: 12,
      }),
    );
  });

  it('accepte le DTO multipart IA avec ses valeurs internes par défaut', async () => {
    const result = await pipe.transform(
      { question: 'Analyse ce document juridique' },
      {
        type: 'body',
        metatype: AskQuestionDto,
        data: undefined,
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        question: 'Analyse ce document juridique',
        analyzeOnly: true,
      }),
    );
  });
});
