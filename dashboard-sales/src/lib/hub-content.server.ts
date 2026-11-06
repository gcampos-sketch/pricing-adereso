import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHubGateway } from './hub-gateway';
import { verifyHubIdentity } from './hub-auth.server';

// Private files are deliberately outside Nitro's public directory/CDN.
const packaged = resolve(process.cwd(), 'private-hub');
const contentRoot = existsSync(packaged) ? packaged : resolve(process.cwd(), '..');
export const handleHubRequest = createHubGateway({ verify: verifyHubIdentity,
  publicOrigin: process.env['RENDER_EXTERNAL_URL'], read: path => readFile(resolve(contentRoot, path)) });
