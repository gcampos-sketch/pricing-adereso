import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireMfa } from './require-mfa';

export const getCommercialDiagnostic = createServerFn({ method: 'GET' })
  .middleware([requireMfa])
  .inputValidator(z.object({ date: z.iso.date().optional() }))
  .handler(async ({ data }) => {
    const { readCommercialDiagnostic } = await import('./commercial-diagnostic.server');
    return readCommercialDiagnostic(data.date);
  });
