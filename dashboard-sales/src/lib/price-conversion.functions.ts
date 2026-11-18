import { createServerFn } from '@tanstack/react-start';
import { requireMfa } from './require-mfa';
import type { RoleFilter } from './owner-roles';

export const getPriceConversion = createServerFn({ method: 'GET' })
  .middleware([requireMfa])
  .inputValidator((input: { role?: string; fresh?: boolean }) => ({ role: (input?.role === 'AE' || input?.role === 'KAM' ? input.role : 'all') as RoleFilter, fresh: input?.fresh === true }))
  .handler(async ({ data }) => {
    const { readPriceReport } = await import('./price-conversion.server');
    return JSON.stringify(await readPriceReport(data.role, data.fresh));
  });
