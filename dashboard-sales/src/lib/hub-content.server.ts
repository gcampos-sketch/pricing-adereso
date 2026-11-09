import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHubGateway } from './hub-gateway';
import { verifyHubIdentity } from './hub-auth.server';
import { createRoiPublicGateway } from './roi-public';
import { createPartnerPublicGateway } from './partner-public';
import { handlePartnerMailRequest } from './partner-mail.server';
import { handleHubWelcomeRequest } from './hub-welcome.server';
import { handleHubEntryRequest } from './hub-entry.server';
import { handleRoiSharingRequest } from './roi-sharing.server';
import { handleCommercialGuidesRequest } from './commercial-guides.server';
import { handleAcademyRequest } from './academy-sync.server';
import { handleNotionOAuthRequest } from './academy-notion-oauth.server';

// Private files are deliberately outside Nitro's public directory/CDN.
const packaged = resolve(process.cwd(), 'private-hub');
const contentRoot = existsSync(packaged) ? packaged : resolve(process.cwd(), '..');
const read = (path: string) => readFile(resolve(contentRoot, path));
const publicRoi = createRoiPublicGateway(read);
const publicPartners = createPartnerPublicGateway(read);
const privateHub = createHubGateway({ verify: verifyHubIdentity,
  publicOrigin: process.env['RENDER_EXTERNAL_URL'], read });
export async function handleHubRequest(request: Request) {
  return await handleRoiSharingRequest(request) ?? await handleHubEntryRequest(request) ?? await handleHubWelcomeRequest(request) ?? await handleCommercialGuidesRequest(request) ?? await handleNotionOAuthRequest(request) ?? await handleAcademyRequest(request) ?? await handlePartnerMailRequest(request) ?? await publicRoi(request) ?? await publicPartners(request) ?? privateHub(request);
}
