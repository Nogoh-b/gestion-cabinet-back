import { Repository, Not } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  TemplateBlock,
  TemplateBlockChannel,
  TemplateBlockKind,
} from './entities/template-block.entity';
import { CreateTemplateBlockDto } from './dto/create-template-block.dto';
import { UpdateTemplateBlockDto } from './dto/update-template-block.dto';

@Injectable()
export class TemplateBlocksService {
  constructor(
    @InjectRepository(TemplateBlock)
    private readonly repository: Repository<TemplateBlock>,
  ) {}

  async create(dto: CreateTemplateBlockDto): Promise<TemplateBlock> {
    const block = this.repository.create(dto as any);
    const saved = (await this.repository.save(block as any)) as unknown as TemplateBlock;
    if (saved.is_default) {
      await this.unsetOtherDefaults(saved.channel, saved.kind, saved.id);
    }
    return saved;
  }

  findAll(): Promise<TemplateBlock[]> {
    return this.repository.find({
      order: { channel: 'ASC', kind: 'ASC', name: 'ASC' },
    });
  }

  findActive(): Promise<TemplateBlock[]> {
    return this.repository.find({
      where: { is_active: true },
      order: { channel: 'ASC', kind: 'ASC', name: 'ASC' },
    });
  }

  /** Blocs actifs d'un canal donné (mail | pdf). */
  findByChannel(channel: TemplateBlockChannel): Promise<TemplateBlock[]> {
    return this.repository.find({
      where: { channel, is_active: true },
      order: { kind: 'ASC', name: 'ASC' },
    });
  }

  /** Bloc par défaut d'un couple (channel, kind). */
  findDefault(
    channel: TemplateBlockChannel,
    kind: TemplateBlockKind,
  ): Promise<TemplateBlock | null> {
    return this.repository.findOne({
      where: { channel, kind, is_default: true, is_active: true },
    });
  }

  async findOne(id: number): Promise<TemplateBlock> {
    const block = await this.repository.findOne({ where: { id } });
    if (!block) throw new NotFoundException(`Bloc de modèle #${id} non trouvé`);
    return block;
  }

  findByCode(code: string): Promise<TemplateBlock | null> {
    return this.repository.findOne({ where: { code } });
  }

  async update(id: number, dto: UpdateTemplateBlockDto): Promise<TemplateBlock> {
    const block = await this.findOne(id);
    // Code et canal/nature des blocs système restent figés.
    if (block.is_system) {
      delete (dto as any).code;
      delete (dto as any).channel;
      delete (dto as any).kind;
    }
    Object.assign(block, dto);
    const saved = await this.repository.save(block);
    if (saved.is_default) {
      await this.unsetOtherDefaults(saved.channel, saved.kind, saved.id);
    }
    return saved;
  }

  async remove(id: number): Promise<void> {
    const block = await this.findOne(id);
    if (block.is_system) {
      block.is_active = false;
      await this.repository.save(block);
      return;
    }
    await this.repository.delete(id);
  }

  /** Garantit qu'un seul bloc est `is_default` par couple (channel, kind). */
  private async unsetOtherDefaults(
    channel: TemplateBlockChannel,
    kind: TemplateBlockKind,
    keepId: number,
  ): Promise<void> {
    await this.repository.update(
      { channel, kind, id: Not(keepId) },
      { is_default: false },
    );
  }
}
