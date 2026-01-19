import {
  useState,
  useEffect,
  useCallback,
  useImperativeHandle,
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

// Define the interface for the actions App.tsx can call
export interface NotificationHandle {
  addNotification: (config: Omit<NotificationConfig, 'id'>) => void;
}

interface NotificationStackProps {
  theme: 'light' | 'dark';
}

// Map variants to default icons and colors
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

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Expose the addNotification function to the parent
  useImperativeHandle(ref, () => ({
    addNotification: (config) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newNotification = { ...defaultNotificationConfig, ...config, id };

      setNotifications((prev) => [...prev, newNotification]);

      if (config.autoDismiss) {
        setTimeout(() => {
          dismiss(id);
        }, config.autoDismiss);
      }
    },
  }));

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[99] flex flex-col gap-3 w-max pointer-events-none">
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
                    theme === 'dark'
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

NotificationStack.displayName = 'NotificationStack';
export default NotificationStack;
