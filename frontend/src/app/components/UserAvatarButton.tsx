import { User } from 'lucide-react';
import { useAppSelector } from '../store';

interface ConfigModalProps {
  onClick: () => void;
}

export default function UserAvatarButton({ onClick }: ConfigModalProps) {
  const selectedUser = useAppSelector((s) => s.machine.selectedUser);

  const userInitial = selectedUser?.name?.trim().charAt(0).toUpperCase();

  return (
    <button
      onClick={onClick}
      className="transition-all duration-300 hover:scale-110"
      aria-label="Switch user"
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg border-2 border-white"
        style={{ backgroundColor: selectedUser?.color ?? 'black' }}
      >
        {userInitial ? (
          <span className="text-white text-lg font-semibold">
            {userInitial}
          </span>
        ) : (
          <User size={24} className="text-white" strokeWidth={2} />
        )}
      </div>
    </button>
  );
}
