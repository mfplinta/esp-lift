import { useCallback, createElement } from 'react';
import { toast, ExternalToast } from 'sonner';
import { LucideIcon } from 'lucide-react';

type NotifyVariant = 'default' | 'success' | 'error' | 'info';

interface NotifyOptions {
  variant?: NotifyVariant;
  icon?: LucideIcon;
  autoDismiss?: number;
}

const variantFn = {
  default: toast,
  success: toast.success,
  error: toast.error,
  info: toast.info,
} as const;

export function useNotify() {
  const notify = useCallback((message: string, options?: NotifyOptions) => {
    const variant = options?.variant ?? 'default';
    const opts: ExternalToast = {
      id: message,
      duration:
        options?.autoDismiss === 0 ? Infinity : (options?.autoDismiss ?? 3000),
    };
    if (options?.icon) {
      opts.icon = createElement(options.icon, { size: 20 });
    }
    variantFn[variant](message, opts);
  }, []);

  const dismissNotification = useCallback((message: string) => {
    toast.dismiss(message);
  }, []);

  return { notify, dismissNotification } as const;
}
