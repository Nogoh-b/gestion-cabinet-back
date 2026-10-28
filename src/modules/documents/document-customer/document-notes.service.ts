import { Repository } from 'typeorm';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { DocumentCustomer } from './entities/document-customer.entity';
import { DocumentCustomerNote } from './entities/document-customer-note.entity';

/** Utilisateur courant tel que le pose la stratégie JWT. */
export interface NoteActor {
  id?: number;
  userId?: number;
  role?: string;
  permissions?: string[];
}

/** Note telle que l'affiche le fil de la visionneuse. */
export interface DocumentNoteView {
  id: number;
  document_id: number;
  content: string;
  version: number;
  author: { id: number; name: string } | null;
  created_at: Date;
  updated_at: Date;
  edited: boolean;
  can_edit: boolean;
}

const MAX_NOTE_LENGTH = 5000;

/**
 * Fil de notes d'un document classé. Tout lecteur du document peut écrire
 * une note ; seul son auteur ou un administrateur peut la modifier ou la
 * supprimer.
 */
@Injectable()
export class DocumentNotesService {
  constructor(
    @InjectRepository(DocumentCustomer)
    private readonly documents: Repository<DocumentCustomer>,
    @InjectRepository(DocumentCustomerNote)
    private readonly notes: Repository<DocumentCustomerNote>,
  ) {}

  async list(documentId: number, actor: NoteActor): Promise<DocumentNoteView[]> {
    await this.document(documentId);
    const rows = await this.notes.find({
      where: { document_id: documentId },
      relations: ['author'],
      order: { created_at: 'DESC', id: 'DESC' },
    });
    return rows.map((row) => this.view(row, actor));
  }

  async create(
    documentId: number,
    content: unknown,
    actor: NoteActor,
  ): Promise<DocumentNoteView> {
    const document = await this.document(documentId);
    const saved = await this.notes.save(
      this.notes.create({
        document_id: documentId,
        content: this.clean(content),
        author_id: actorId(actor),
        version: document.version ?? 1,
      }),
    );
    return this.view(await this.note(documentId, saved.id), actor);
  }

  async update(
    documentId: number,
    noteId: number,
    content: unknown,
    actor: NoteActor,
  ): Promise<DocumentNoteView> {
    const note = await this.note(documentId, noteId);
    this.assertCanEdit(note, actor);
    note.content = this.clean(content);
    await this.notes.save(note);
    return this.view(await this.note(documentId, noteId), actor);
  }

  async remove(
    documentId: number,
    noteId: number,
    actor: NoteActor,
  ): Promise<{ id: number; deleted: true }> {
    const note = await this.note(documentId, noteId);
    this.assertCanEdit(note, actor);
    await this.notes.softDelete({ id: note.id });
    return { id: note.id, deleted: true };
  }

  private async document(id: number): Promise<DocumentCustomer> {
    const document = await this.documents.findOne({
      where: { id },
      select: { id: true, version: true },
    });
    if (!document) {
      throw new NotFoundException(`Document avec l'ID ${id} introuvable`);
    }
    return document;
  }

  private async note(documentId: number, noteId: number): Promise<DocumentCustomerNote> {
    const note = await this.notes.findOne({
      where: { id: noteId, document_id: documentId },
      relations: ['author'],
    });
    if (!note) throw new NotFoundException('Note introuvable');
    return note;
  }

  private clean(content: unknown): string {
    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) throw new BadRequestException('La note est vide');
    if (text.length > MAX_NOTE_LENGTH) {
      throw new BadRequestException(
        `La note dépasse ${MAX_NOTE_LENGTH} caractères`,
      );
    }
    return text;
  }

  private assertCanEdit(note: DocumentCustomerNote, actor: NoteActor): void {
    if (!canEditNote(note, actor)) {
      throw new ForbiddenException(
        "Seul l'auteur de la note ou un administrateur peut la modifier",
      );
    }
  }

  private view(note: DocumentCustomerNote, actor: NoteActor): DocumentNoteView {
    const author = note.author;
    const name = author
      ? String(
          [author.first_name, author.last_name].filter(Boolean).join(' ') ||
            author.username ||
            `#${author.id}`,
        ).trim()
      : '';
    return {
      id: note.id,
      document_id: note.document_id,
      content: note.content,
      version: note.version,
      author: note.author_id ? { id: note.author_id, name } : null,
      created_at: note.created_at,
      updated_at: note.updated_at,
      edited:
        !!note.updated_at &&
        !!note.created_at &&
        note.updated_at.getTime() - note.created_at.getTime() > 1000,
      can_edit: canEditNote(note, actor),
    };
  }
}

function actorId(actor: NoteActor): number | null {
  return Number(actor?.userId ?? actor?.id) || null;
}

/** L'auteur de la note, ou un administrateur du cabinet. */
export function canEditNote(
  note: Pick<DocumentCustomerNote, 'author_id'>,
  actor: NoteActor,
): boolean {
  if (actor?.role === 'admin') return true;
  if (Array.isArray(actor?.permissions) && actor.permissions.includes('SUPER_ADMIN')) {
    return true;
  }
  const id = actorId(actor);
  return !!id && Number(note.author_id) === id;
}
