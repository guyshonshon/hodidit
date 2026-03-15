import * as RadixTooltip from "@radix-ui/react-tooltip";
import { forwardRef } from "react";

export const TooltipProvider = RadixTooltip.Provider;
export const Tooltip = RadixTooltip.Root;
export const TooltipTrigger = RadixTooltip.Trigger;

export const TooltipContent = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof RadixTooltip.Content>
>(({ children, style, ...props }, ref) => (
  <RadixTooltip.Portal>
    <RadixTooltip.Content
      ref={ref}
      sideOffset={6}
      style={{
        background: "#1a2545",
        border: "1px solid #2a3a60",
        color: "#dde4f0",
        fontSize: "11px",
        fontFamily: "JetBrains Mono, monospace",
        padding: "5px 10px",
        borderRadius: "6px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        zIndex: 9999,
        ...style,
      }}
      {...props}
    >
      {children}
      <RadixTooltip.Arrow style={{ fill: "#1a2545" }} />
    </RadixTooltip.Content>
  </RadixTooltip.Portal>
));
TooltipContent.displayName = "TooltipContent";
