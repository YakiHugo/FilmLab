import * as React from "react";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

const ContextMenu = ContextMenuPrimitive.Root;

const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

const ContextMenuGroup = ContextMenuPrimitive.Group;

const ContextMenuPortal = ContextMenuPrimitive.Portal;

const ContextMenuSub = ContextMenuPrimitive.Sub;

const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <ContextMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "MenuItem flex min-h-[28px] cursor-default select-none items-center gap-4 px-4 py-1 text-[12px] font-normal leading-[1.35] text-[#eeeeee] outline-none transition data-[disabled]:pointer-events-none data-[disabled]:text-[#6e6e6e] data-[state=open]:bg-[#303030] focus:bg-[#303030]",
      inset && "pl-8",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-4 w-4 text-zinc-400" />
  </ContextMenuPrimitive.SubTrigger>
));
ContextMenuSubTrigger.displayName = ContextMenuPrimitive.SubTrigger.displayName;

const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      "ContextMenu z-50 min-w-[200px] overflow-hidden rounded-[6px] border border-[#282828] bg-[#1b1b1b] py-2 text-[#eeeeee] shadow-[0_2px_4px_rgba(0,0,0,0.1)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
      className
    )}
    {...props}
  />
));
ContextMenuSubContent.displayName = ContextMenuPrimitive.SubContent.displayName;

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      ref={ref}
      className={cn(
        "ContextMenu z-50 min-w-[200px] overflow-hidden rounded-[6px] border border-[#282828] bg-[#1b1b1b] py-2 text-[#eeeeee] shadow-[0_2px_4px_rgba(0,0,0,0.1)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
        className
      )}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
));
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName;

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
    destructive?: boolean;
    inset?: boolean;
  }
>(({ className, destructive = false, inset, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    className={cn(
      "MenuItem relative flex min-h-[28px] cursor-default select-none items-center gap-4 px-4 py-1 text-[12px] font-normal leading-[1.35] outline-none transition data-[disabled]:pointer-events-none data-[disabled]:text-[#6e6e6e] focus:bg-[#303030]",
      destructive ? "text-[#eb5656] focus:text-[#eb5656]" : "text-[#eeeeee]",
      inset && "pl-8",
      className
    )}
    {...props}
  />
));
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName;

const ContextMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <ContextMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "MenuItem relative flex min-h-[28px] cursor-default select-none items-center py-1 pl-8 pr-4 text-[12px] font-normal leading-[1.35] text-[#eeeeee] outline-none transition data-[disabled]:pointer-events-none data-[disabled]:text-[#6e6e6e] focus:bg-[#303030]",
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-3 flex h-4 w-4 items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.CheckboxItem>
));
ContextMenuCheckboxItem.displayName = ContextMenuPrimitive.CheckboxItem.displayName;

const ContextMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <ContextMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "MenuItem relative flex min-h-[28px] cursor-default select-none items-center py-1 pl-8 pr-4 text-[12px] font-normal leading-[1.35] text-[#eeeeee] outline-none transition data-[disabled]:pointer-events-none data-[disabled]:text-[#6e6e6e] focus:bg-[#303030]",
      className
    )}
    {...props}
  >
    <span className="absolute left-3 flex h-4 w-4 items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator>
        <Circle className="h-2.5 w-2.5 fill-current" />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.RadioItem>
));
ContextMenuRadioItem.displayName = ContextMenuPrimitive.RadioItem.displayName;

const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <ContextMenuPrimitive.Label
    ref={ref}
    className={cn(
      "px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[#818181]",
      inset && "pl-8",
      className
    )}
    {...props}
  />
));
ContextMenuLabel.displayName = ContextMenuPrimitive.Label.displayName;

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator
    ref={ref}
    className={cn("MenuSeparator my-2 h-px bg-[#282828]", className)}
    {...props}
  />
));
ContextMenuSeparator.displayName = ContextMenuPrimitive.Separator.displayName;

function ContextMenuShortcut({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "ml-auto flex items-center justify-end pl-5 text-[11px] text-[#d9d9d9] [&_span]:flex [&_span]:items-center [&_span]:gap-1 [&_kbd]:rounded-[4px] [&_kbd]:border [&_kbd]:border-[#4a4a4a] [&_kbd]:bg-[#333333] [&_kbd]:px-1.5 [&_kbd]:py-0.5 [&_kbd]:font-[inherit] [&_kbd]:text-[inherit] [&_kbd]:leading-none",
        className
      )}
    >
      {children}
    </div>
  );
}
ContextMenuShortcut.displayName = "ContextMenuShortcut";

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
};
