import { createServerFn } from '@tanstack/react-start';
import { requireMfa } from './require-mfa';

export const getPipelineAnalysis = createServerFn({ method: 'GET' })
  .middleware([requireMfa])
  .inputValidator((input: { periods: string[]; owner: string; role?: string }) => {
    if (!Array.isArray(input?.periods) || input.periods.length < 1 || input.periods.length > 4 ||
      input.periods.some(period => typeof period !== 'string' || !/^20\d{2}-Q[1-4]$/.test(period)) ||
      typeof input.owner !== 'string' || !/^(team|\d{1,20})$/.test(input.owner)) throw Error('Filtros de pipeline inválidos.');
    const role = input.role === 'AE' || input.role === 'KAM' ? input.role : 'all';
    return { periods: [...new Set(input.periods)].sort(), owner: input.owner, role } as const;
  })
  .handler(async ({ data }) => {
    const { readPipelineAnalysis } = await import('./pipeline-analysis.server');
    return JSON.stringify(await readPipelineAnalysis(data));
  });
