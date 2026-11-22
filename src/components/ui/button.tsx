import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "ke-button inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-full font-medium tracking-tight transition-[color,background-color,box-shadow,transform] duration-200 ease-out touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg shadow-2 hover:-translate-y-px hover:shadow-3 active:translate-y-0 active:scale-[0.98] active:shadow-1",
        secondary: "bg-surface text-fg shadow-1 ring-1 ring-border hover:bg-surface-2",
        outline: "border border-border bg-transparent text-fg hover:bg-surface-2",
        ghost: "text-fg hover:bg-surface-2/70",
        danger: "bg-danger text-primary-fg shadow-2 hover:-translate-y-px hover:shadow-3 active:scale-[0.98] active:shadow-1",
        destructive: "bg-danger text-primary-fg shadow-2 hover:-translate-y-px hover:shadow-3 active:scale-[0.98] active:shadow-1",
        apple: "bg-fg text-bg shadow-2 hover:-translate-y-px hover:shadow-3 active:scale-[0.98] active:shadow-1",
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
