import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aurum disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "border border-amber-400/30 bg-gradient-to-r from-amber-500 to-amber-600 font-semibold text-neutral-950 shadow-lg shadow-amber-500/10 transition-all hover:from-amber-400 hover:to-amber-500",
        royal: "border border-violet-400/20 bg-gradient-to-b from-royal to-royalDeep text-white shadow-[0_14px_34px_rgba(109,40,217,0.22)] hover:brightness-110",
        ghost: "border border-[#1F2430] bg-[#0E1017]/80 text-white/86 backdrop-blur-md transition-all hover:border-violet-500/30 hover:bg-white/[0.075]",
        danger: "bg-red-500/15 text-red-200 ring-1 ring-red-400/30 hover:bg-red-500/25",
      },
      size: {
        sm: "h-9 px-3",
        md: "h-11 px-5",
        lg: "h-13 px-6 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";