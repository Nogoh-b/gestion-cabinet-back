import { instanceToPlain, plainToInstance } from 'class-transformer';
import { ExpenseLineResponseDto } from './expense-report-response.dto';
import { SupplierInvoiceResponseDto } from './supplier-invoice-response.dto';

describe('Supplier private evidence response DTOs', () => {
  const privateStorageKey =
    'tenant-7/supplier-evidence/invoice/019-file.pdf';
  const sha256 = 'a'.repeat(64);

  it('exposes safe invoice evidence metadata without the storage key', () => {
    const response = plainToInstance(
      SupplierInvoiceResponseDto,
      {
        id: 12,
        attachment_url: privateStorageKey,
        attachment_original_name: 'facture.pdf',
        attachment_mime_type: 'application/pdf',
        attachment_size: '321',
        attachment_sha256: sha256,
      },
      { excludeExtraneousValues: true },
    );
    const plain = instanceToPlain(response);

    expect(plain).toMatchObject({
      id: 12,
      has_attachment: true,
      attachment_original_name: 'facture.pdf',
      attachment_mime_type: 'application/pdf',
      attachment_size: '321',
      attachment_sha256: sha256,
    });
    expect(plain).not.toHaveProperty('attachment_url');
    expect(JSON.stringify(plain)).not.toContain(privateStorageKey);
  });

  it('exposes safe expense evidence metadata without the storage key', () => {
    const response = plainToInstance(
      ExpenseLineResponseDto,
      {
        id: 18,
        category: 'transport',
        attachment_url: privateStorageKey,
        attachment_original_name: 'ticket.jpg',
        attachment_mime_type: 'image/jpeg',
        attachment_size: '654',
        attachment_sha256: sha256,
        expense_report: { status: 'draft' },
      },
      { excludeExtraneousValues: true },
    );
    const plain = instanceToPlain(response);

    expect(plain).toMatchObject({
      id: 18,
      has_attachment: true,
      attachment_original_name: 'ticket.jpg',
      attachment_mime_type: 'image/jpeg',
      attachment_size: '654',
      attachment_sha256: sha256,
      expense_report_status: 'draft',
    });
    expect(plain).not.toHaveProperty('attachment_url');
    expect(JSON.stringify(plain)).not.toContain(privateStorageKey);
  });
});
