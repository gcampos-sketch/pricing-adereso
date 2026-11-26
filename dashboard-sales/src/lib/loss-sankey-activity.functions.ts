import { createServerFn } from '@tanstack/react-start';
import { LOSS_ACTIVITY_BATCH_SIZE } from './loss-sankey-activity';
import { requireMfa } from './require-mfa';

export const getLossSankeyActivity = createServerFn({ method: 'POST' })
  .middleware([requireMfa])
  .inputValidator((input: { ids: string[] }) => {
    if (!Array.isArray(input?.ids) || input.ids.length < 1 || input.ids.length > LOSS_ACTIVITY_BATCH_SIZE ||
        input.ids.some(id => typeof id !== 'string' || !/^\d+$/.test(id))) throw new Error('Selección de negocios inválida');
    return { ids: [...new Set(input.ids)] };
  })
  .handler(async ({ data }) => {
    const { readLossSankeyActivity } = await import('./loss-sankey-activity.server');
    return readLossSankeyActivity(data.ids);
  });
