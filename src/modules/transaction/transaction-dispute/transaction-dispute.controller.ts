import { Controller, Post, Patch, Get, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { DisputeStatus } from './entities/transaction-dispute.entity';
import { TransactionDisputeService } from './transaction-dispute.service';
import { CreateTransactionDisputeDto, SearchDisputeQueryDto } from './dto/create-transaction-dispute.dto';
import { UpdateTransactionDisputeDto } from './dto/update-transaction-dispute.dto';
import { TransactionDisputeDto } from './dto/response-transaction-dispute.dto';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

@Controller('transaction-disputes')
export class TransactionDisputeController {
  constructor(private readonly disputeService: TransactionDisputeService) {}

  @Post()
  create(@Body() dto: CreateTransactionDisputeDto): Promise<TransactionDisputeDto> {
    return this.disputeService.createDisputeForProblematicTransaction(dto.transaction_id, dto.description);
  }

  @Patch(':id/resolve')
  resolve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTransactionDisputeDto
  ) {
    const status =  DisputeStatus.RESOLVED;
    return this.disputeService.updateDisputeStatus(id, status, dto.resolution_notes);
  }
  @Patch(':id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTransactionDisputeDto
  ) {
    const status = DisputeStatus.REJECTED;
    return this.disputeService.updateDisputeStatus(id, status, dto.resolution_notes);
  }




  @Get(':id')
  @ApiOperation({ summary: 'Récupérer une dispute par son ID' })
  @ApiParam({ name: 'id', type: String, description: 'ID de la dispute' })
  @ApiResponse({ status: 200, description: 'Dispute trouvée' })
  @ApiResponse({ status: 404, description: 'Dispute non trouvée' })
  findOne(@Param('id') id: string): Promise<any> {
    return this.disputeService.findOne(+id);
  }

  @Get('by-reference/:reference')
  @ApiOperation({ summary: 'Récupérer une dispute par son reference' })
  @ApiParam({ name: 'reference', type: String, description: 'reference de la dispute' })
  @ApiResponse({ status: 200, description: 'Dispute trouvée' })
  @ApiResponse({ status: 404, description: 'Dispute non trouvée' })
  findOneByReference(@Param('reference') reference: string): Promise<any> {
    return this.disputeService.findOneByReference(reference);
  }


  @Get()
  findOpen(@Query() query: SearchDisputeQueryDto): Promise<any> {
    return this.disputeService.findAll(query);
  }
}
