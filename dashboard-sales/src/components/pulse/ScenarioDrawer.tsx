import type {ReactNode} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {X} from 'lucide-react';
/** A single focused scenario over the existing list; closing restores its trigger. */
export function ScenarioDrawer({open,onOpenChange,title,description,trigger,children}:{open:boolean;onOpenChange:(open:boolean)=>void;title:string;description:string;trigger:ReactNode;children:ReactNode}) {
 return <Dialog.Root open={open} onOpenChange={onOpenChange}>
  <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
  <Dialog.Portal>
   <Dialog.Overlay className="scenario-drawer-backdrop" />
   <Dialog.Content className="scenario-drawer" data-scenario-drawer="" onEscapeKeyDown={event=>event.stopPropagation()}>
    <header className="scenario-drawer-heading"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div><Dialog.Close aria-label="Cerrar escenario"><X size={19}/></Dialog.Close></header>
    <div className="scenario-drawer-body">{children}</div>
   </Dialog.Content>
  </Dialog.Portal>
 </Dialog.Root>;
}
