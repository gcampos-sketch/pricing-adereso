import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";
import { popupOverTrigger } from "@/lib/popup-placement";

const OriginContext = React.createContext<React.RefObject<HTMLElement | null> | null>(null);
function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const origin = React.useRef<HTMLElement | null>(null);
  return <OriginContext.Provider value={origin}><PopoverPrimitive.Root {...props} /></OriginContext.Provider>;
}
const PopoverTrigger = React.forwardRef<React.ElementRef<typeof PopoverPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>>(({onPointerDownCapture,onKeyDownCapture,onClickCapture,...props},ref) => {
  const origin = React.useContext(OriginContext);
  const remember = (element: HTMLElement) => { if(origin) origin.current = element; };
  return <PopoverPrimitive.Trigger {...props} ref={ref}
    onPointerDownCapture={event=>{remember(event.currentTarget);onPointerDownCapture?.(event);}}
    onKeyDownCapture={event=>{remember(event.currentTarget);onKeyDownCapture?.(event);}}
    onClickCapture={event=>{remember(event.currentTarget);onClickCapture?.(event);}} />;
});
PopoverTrigger.displayName = "PopoverTrigger";
const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
  & { originMotion?: boolean }
>(({ className, align = "center", sideOffset = 4, style, originMotion = true, ...props }, ref) => {
  const origin = React.useContext(OriginContext);
  const content = React.useRef<HTMLDivElement | null>(null);
  const source = React.useRef<HTMLElement | null>(null);
  const stopTracking = React.useRef<(() => void) | null>(null);
  // Details expand over their source card; only screen edges can displace them.
  const overTrigger = /(?:won-mix-popover|service-directory-popup|commission-popover|won-stage-popover|notification-popup|adobo-score-popup)/.test(className ?? "");
  const positionOrigin = (node: HTMLDivElement) => {
    const trigger = origin?.current ?? source.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (!trigger || trigger === document.body || node.contains(trigger)) return;
    source.current = trigger;
    const from = trigger.getBoundingClientRect();
    const target = overTrigger ? popupOverTrigger(from, {width:node.offsetWidth,height:node.offsetHeight}, {width:window.innerWidth,height:window.innerHeight}) : node.getBoundingClientRect();
    if (overTrigger) {
      const wrapper = node.closest<HTMLElement>('[data-radix-popper-content-wrapper]');
      wrapper?.style.setProperty('--popup-left', `${target.left}px`);
      wrapper?.style.setProperty('--popup-top', `${target.top}px`);
    }
    node.style.setProperty('--popup-from-x', `${from.left+from.width/2-target.left-target.width/2}px`);
    node.style.setProperty('--popup-from-y', `${from.top+from.height/2-target.top-target.height/2}px`);
    node.style.setProperty('--popup-from-scale-x', `${Math.min(1,Math.max(.05,from.width/Math.max(target.width,1)))}`);
    node.style.setProperty('--popup-from-scale-y', `${Math.min(1,Math.max(.05,from.height/Math.max(target.height,1)))}`);
  };
  return <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={node=>{
        stopTracking.current?.();
        content.current=node;
        if(node && originMotion) {
          positionOrigin(node);
          const reposition = () => positionOrigin(node);
          const observer = new ResizeObserver(reposition);
          observer.observe(node);
          window.addEventListener('resize',reposition);
          const onScroll = (event: Event) => {if(!(event.target instanceof Node) || !node.contains(event.target))reposition();};
          window.addEventListener('scroll',onScroll,true);
          stopTracking.current=()=>{observer.disconnect();window.removeEventListener('resize',reposition);window.removeEventListener('scroll',onScroll,true);};
        }
        if(typeof ref==='function')ref(node);else if(ref)ref.current=node;
      }}
      align={align}
      sideOffset={sideOffset}
      className={cn("z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none", originMotion && "dashboard-origin-popover", className)}
      style={style}
      {...props}
      data-trigger-detail={overTrigger ? "true" : undefined}
    />
  </PopoverPrimitive.Portal>;
});
PopoverContent.displayName = "PopoverContent";
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
