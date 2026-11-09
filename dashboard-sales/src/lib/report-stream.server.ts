import { createPulseStream } from './report-stream';
import { verifyHubIdentity } from './hub-auth.server';
import { readPulseReport } from './pulse-loader.server';
import { packReport } from './report-wire';

export const handleReportStream = createPulseStream({
  authorize: verifyHubIdentity,
  publicOrigin: process.env['RENDER_EXTERNAL_URL'],
  load: async (role, phase) => {
    const report = await readPulseReport(false, role, phase);
    phase('ready');
    return packReport(report);
  },
});
