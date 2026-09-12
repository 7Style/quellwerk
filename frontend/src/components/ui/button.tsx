import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/*
 * Sizes and looks come from design/styles.css, the variant names stay shadcn's.
 *
 * The prototype's scale is smaller than shadcn's default: a button is 32px and
 * an icon button 28px, on 13px type. Vendored primitives exist to be edited, and
 * the alternative - a second button component beside this one - is how an
 * interface ends up with two of everything. The mapping:
 *
 *   default     .btn-primary, the filled ink button
 *   outline     .btn, the bordered one on surface (what the dialog uses)
 *   ghost       .btn-quiet
 *   destructive .btn-danger
 *
 * `[&_svg]:size-4` is gone on purpose: Icon sets its own box, and forcing 16px
 * here would silently shrink the one place the prototype draws a 20px glyph.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-ui font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border border-ink bg-ink text-ink-inverse hover:bg-ink/90',
        destructive: 'border border-danger bg-transparent text-danger hover:bg-danger-wash',
        outline: 'border border-rule-strong bg-surface text-ink hover:bg-surface-sunken',
        secondary: 'border border-transparent bg-surface-sunken text-ink hover:bg-rule',
        ghost:
          'border border-transparent bg-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink',
        link: 'text-ink underline-offset-4 hover:underline',
      },
      /*
       * Pixels, not scale steps. `--spacing-1` to `--spacing-8` carry the
       * prototype's padding scale (styles/global.css), and Tailwind sizes from
       * the same namespace, so `h-8` would be 64px here rather than 32.
       */
      size: {
        default: 'h-[32px] px-3',
        sm: 'h-[28px] px-2 text-small',
        lg: 'h-[38px] px-4 text-ui-lg',
        icon: 'h-[28px] w-[28px] p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
