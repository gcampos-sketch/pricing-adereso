import { createServerFn } from '@tanstack/react-start';
import { requireMfa } from './require-mfa';

export const getSalesNotifications = createServerFn({method:'GET'})
  .middleware([requireMfa])
  .handler(async ({context}) => {
    const {syncSalesNotifications}=await import('./sales-notifications.server');
    const email=String((context.claims as {email?:string}).email ?? '');
    return syncSalesNotifications(context.userId,email);
  });