import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-medium tracking-tight transition-[color,background-color,box-shadow,transform] duration-200 ease-out touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none active:scale-[0.99]",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg shadow-card hover:bg-primary/90",
        secondary: "bg-surface text-fg ring-1 ring-slate-200/80 hover:bg-surface-2 dark:ring-white/15",
        outline: "border border-slate-200/80 bg-transparent text-fg hover:bg-surface-2 dark:border-white/15",
        ghost: "text-fg hover:bg-surface-2/70",
        danger: "bg-danger text-primary-fg hover:bg-danger/90",
        destructive: "bg-danger text-primary-fg hover:bg-danger/90",
        apple: "bg-fg text-bg hover:bg-fg/90",
      },
      size: {
        sm: "h-9 rounded-full px-3.5 text-sm",
        md: "h-11 rounded-full px-5 text-sm",
        lg: "h-14 rounded-full px-6 text-base",
        icon: "size-11 rounded-full",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
