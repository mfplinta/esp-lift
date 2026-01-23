import {
  useState,
  useEffect,
  useCallback,
  useImperativeHandle,
  useRef,
  forwardRef,
} from 'react';
import {
  X,
  LucideIcon,
  Info,
  CheckCircle2,
  AlertTriangle,
  Circle,
} from 'lucide-react';
import { useStore } from '../store';

export interface NotificationConfig {
  id: string;
  message: string;
  icon?: LucideIcon;
  variant?: 'default' | 'success' | 'error' | 'info';
  autoDismiss?: number;
  showClose?: boolean;
}

const defaultNotificationConfig: Partial<NotificationConfig> = {
  variant: 'default',
  autoDismiss: 3000,
  showClose: true,
};

export interface NotificationHandle {
  addNotification: (config: Omit<NotificationConfig, 'id'>) => void;
  dismissByMessage: (message: string) => void;
}

interface NotificationStackProps {
  theme: 'light' | 'dark';
}

const variantIconMap: Record<
  NonNullable<NotificationConfig['variant']>,
  LucideIcon
> = {
  default: Circle,
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

const variantIconColorMap: Record<
  NonNullable<NotificationConfig['variant']>,
  { light: string; dark: string }
> = {
  default: { light: 'text-gray-500', dark: 'text-gray-400' },
  success: { light: 'text-green-600', dark: 'text-green-400' },
  error: { light: 'text-red-600', dark: 'text-red-400' },
  info: { light: 'text-blue-600', dark: 'text-blue-400' },
};

const variantStylesMap: Record<
  NonNullable<NotificationConfig['variant']>,
  { light: string; dark: string }
> = {
  default: {
    light: 'bg-white border-gray-300 text-black shadow-lg',
    dark: 'bg-gray-900 border-gray-700 text-white',
  },
  success: {
    light: 'bg-green-100 border-green-300 text-green-900',
    dark: 'bg-green-950 border-green-800 text-green-200',
  },
  error: {
    light: 'bg-red-100 border-red-300 text-red-900',
    dark: 'bg-red-950 border-red-800 text-red-200',
  },
  info: {
    light: 'bg-blue-100 border-blue-300 text-blue-900',
    dark: 'bg-blue-950 border-blue-800 text-blue-200',
  },
};

const NotificationStack = forwardRef<
  NotificationHandle,
  NotificationStackProps
>(({ theme }, ref) => {
  const [notifications, setNotifications] = useState<NotificationConfig[]>([]);
  const timeoutMap = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const isDarkMode = useStore((s) => s.config.theme === 'dark');

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const timeout = timeoutMap.current.get(id);
    if (timeout !== undefined) {
      clearTimeout(timeout);
      timeoutMap.current.delete(id);
    }
  }, []);

  const dismissByMessage = useCallback((message: string) => {
    setNotifications((prev) => {
      const toRemove = prev.find((n) => n.message === message);
      if (toRemove) {
        const timeout = timeoutMap.current.get(toRemove.id);
        if (timeout !== undefined) {
          clearTimeout(timeout);
          timeoutMap.current.delete(toRemove.id);
        }
        return prev.filter((n) => n.id !== toRemove.id);
      }
      return prev;
    });
  }, []);

  useImperativeHandle(ref, () => ({
    addNotification: (config) => {
      setNotifications((prev) => {
        const existing = prev.find((n) => n.message === config.message);
        if (existing) {
          const updated = { ...existing, ...config };

          const prevTimeout = timeoutMap.current.get(existing.id);
          if (prevTimeout !== undefined) {
            clearTimeout(prevTimeout);
            timeoutMap.current.delete(existing.id);
          }

          if (updated.autoDismiss !== undefined && updated.autoDismiss > 0) {
            const newTimeout = setTimeout(() => {
              dismiss(existing.id);
            }, updated.autoDismiss);
            timeoutMap.current.set(existing.id, newTimeout);
          }

          return prev.map((n) => (n.id === existing.id ? updated : n));
        } else {
          const id = Math.random().toString(36).substring(2, 9);
          const newNotification: NotificationConfig = {
            ...(defaultNotificationConfig as NotificationConfig),
            ...config,
            id,
          };

          if (
            newNotification.autoDismiss !== undefined &&
            newNotification.autoDismiss > 0
          ) {
            const newTimeout = setTimeout(() => {
              dismiss(id);
            }, newNotification.autoDismiss);
            timeoutMap.current.set(id, newTimeout);
          }

          return [...prev, newNotification];
        }
      });
    },
    dismissByMessage,
  }));

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutMap.current.forEach((timeout) => {
        if (timeout !== undefined) clearTimeout(timeout);
      });
      timeoutMap.current.clear();
    };
  }, []);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-3 w-max pointer-events-none">
      {notifications.map((notification) => {
        const variant = notification.variant || 'default';
        const Icon = notification.icon || variantIconMap[variant];
        const iconColor = variantIconColorMap[variant][theme];
        const variantStyles = variantStylesMap[variant][theme];

        return (
          <div
            key={notification.id}
            className="animate-in fade-in slide-in-from-top-4 duration-300 group pointer-events-auto"
          >
            <div
              className={`flex items-center justify-center min-h-[56px] min-w-[280px] px-12 rounded-full relative border ${variantStyles}`}
            >
              <div className="flex items-center gap-3">
                {Icon && <Icon size={20} className={iconColor} />}
                <span className="text-base sm:text-lg font-bold whitespace-nowrap tracking-tight">
                  {notification.message}
                </span>
              </div>

              {notification.showClose && (
                <button
                  onClick={() => dismiss(notification.id)}
                  className={`absolute right-4 p-1.5 rounded-full transition-all opacity-0 group-hover:opacity-100 ${
                    isDarkMode
                      ? 'hover:bg-gray-800 text-gray-400'
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  <X size={16} strokeWidth={3} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default NotificationStack;
