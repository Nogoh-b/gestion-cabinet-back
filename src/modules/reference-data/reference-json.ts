import { ValueTransformer } from 'typeorm';
import { deflateRawSync, inflateRawSync } from 'zlib';

/** Versioned snapshots contain large HTML templates; keep database packets bounded. */
export const referenceJson: ValueTransformer = {
  to(value: any) {
    return (
      'deflate:' +
      deflateRawSync(Buffer.from(JSON.stringify(value ?? []), 'utf8')).toString(
        'base64',
      )
    );
  },
  from(value: any) {
    if (typeof value !== 'string') return value;
    return value.startsWith('deflate:')
      ? JSON.parse(
          inflateRawSync(Buffer.from(value.slice(8), 'base64')).toString(
            'utf8',
          ),
        )
      : JSON.parse(value);
  },
};
