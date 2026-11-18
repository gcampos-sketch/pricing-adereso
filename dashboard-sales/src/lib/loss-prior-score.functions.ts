import { createServerFn } from '@tanstack/react-start';
import { requireMfa } from './require-mfa';
export const getLossPriorScores = createServerFn({method:'POST'}).middleware([requireMfa])
  .inputValidator((input: { ids: string[] }) => {
    if (!Array.isArray(input?.ids) || !input.ids.length || input.ids.length > 50 || input.ids.some(id => typeof id !== 'string' || !/^\d+$/.test(id))) throw Error('Selección de negocios inválida');
    return { ids: [...new Set(input.ids)] };
  }).handler(async ({data}) => {
    const {readLossPriorScores} = await import('./loss-prior-score.server');
    return readLossPriorScores(data.ids);
  });
