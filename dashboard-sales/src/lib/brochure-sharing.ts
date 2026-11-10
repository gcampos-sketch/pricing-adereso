import { z } from 'zod';
export { RoiError as BrochureError } from './roi-sharing';
export const brochureSections = ['intro','credentials','platform','usecases','operation','impact','closing','releases'] as const;
export const brochureSection = z.enum(brochureSections);
export const brochureToken = z.string().regex(/^[a-f0-9]{64}$/);
export const brochureShareInput = z.object({ requestId:z.string().uuid(), dealId:z.string().regex(/^\d{1,20}$/) }).strict();
export const brochureEventInput = z.object({
 token:brochureToken, sessionId:z.string().uuid(), sequence:z.number().int().min(0).max(500),
 kind:z.enum(['open','section','interaction']), section:brochureSection.nullable(),
 progress:z.number().int().min(0).max(100), seconds:z.number().int().min(0).max(60),
 interaction:z.enum(['nav-intro','nav-credentials','nav-usecases','nav-platform','nav-closing','link-evidence','link-security','link-contact','proof-toggle','evidence-toggle','agents-toggle','delivery-next','release-open','release-close','release-detail','release-guide','download-pdf','route-0','route-1','route-2','route-3','route-4','stage-0','stage-1','stage-2','stage-3','stage-4','case-0','case-1','case-2','mission-0','mission-1','mission-2','delivery-0','delivery-1','delivery-2','delivery-3','delivery-4','scene-0-0','scene-0-1','scene-0-2','scene-0-3','scene-0-4','scene-1-0','scene-1-1','scene-1-2','scene-1-3','scene-1-4','scene-2-0','scene-2-1','scene-2-2','scene-2-3','scene-2-4']).nullable(),
}).strict().refine(e=>e.kind==='open'?e.sequence===0&&e.section===null&&e.interaction===null&&e.seconds===0&&e.progress===0:e.sequence>0&&e.section!==null&&(e.kind==='interaction'?e.interaction!==null&&e.seconds===0:e.interaction===null&&e.seconds>=2));
export type BrochureShareInput=z.infer<typeof brochureShareInput>;
export type BrochureEvent=z.infer<typeof brochureEventInput>;
export function brochureLink(origin:string,token:string){const url=new URL('/brochure/',origin);url.searchParams.set('b',brochureToken.parse(token));return url.href;}
