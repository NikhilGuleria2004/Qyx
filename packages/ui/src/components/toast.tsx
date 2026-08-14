import * as ToastPrimitive from '@radix-ui/react-toast';

export function Toast({ open, onOpenChange, title, description }: { open: boolean; onOpenChange: (v: boolean) => void; title?: string; description?: string }) {
  return (
    <ToastPrimitive.Provider swipeDirection="right">
      <ToastPrimitive.Root open={open} onOpenChange={onOpenChange} asChild>
        <div className="rounded border border-hairline bg-raised p-3 shadow-none">
          {title && <div className="font-mono text-sm text-text-primary">{title}</div>}
          {description && <div className="font-mono text-xs text-text-secondary mt-1">{description}</div>}
        </div>
      </ToastPrimitive.Root>
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 flex flex-col gap-2" />
    </ToastPrimitive.Provider>
  );
}
