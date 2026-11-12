import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-md font-medium tracking-tight transition-[color,background-color,box-shadow,transform] duration-200 ease-out touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none active:scale-[0.99]",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg shadow-card hover:bg-primary/90",
        secondary: "bg-surface text-fg ring-1 ring-border hover:bg-surface-2",
        outline: "border border-border bg-transparent text-fg hover:bg-surface-2",
        ghost: "text-fg hover:bg-surface-2/70",
        danger: "bg-danger text-primary-fg hover:bg-danger/90",
        destructive: "bg-danger text-primary-fg hover:bg-danger/90",
        apple: "bg-fg text-bg hover:bg-fg/90",
      },
      size: {
        sm: "h-9 rounded-md px-3.5 text-sm",
        md: "h-11 rounded-md px-5 text-sm",
        lg: "h-14 rounded-md px-6 text-base",
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
