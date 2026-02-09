import { User, X, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import AddUserModal from './AddUserModal';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserSelection({ isOpen, onClose }: AddUserModalProps) {
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { isDarkMode, users, selectUser, addUser, deleteUser } = useStore(
    useShallow((s) => ({
      isDarkMode: s.config.theme === 'dark',
      users: s.users,
      selectUser: s.selectUser,
      addUser: s.addUser,
      deleteUser: s.deleteUser,
    }))
  );

  if (!isOpen) return null;

  const handleSelectUser = (name: string) => {
    selectUser(name);
    onClose();
  };

  const handleDeleteClick = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm(name);
  };

  const confirmDelete = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteUser(name);
    setDeleteConfirm(null);
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm(null);
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-[100] flex items-center justify-center transition-colors duration-300 ${
          isDarkMode ? 'bg-black' : 'bg-white'
        }`}
      >
        {
          <button
            onClick={() => onClose()}
            className={`absolute top-3 right-6 p-3 rounded-full transition-all duration-300 shadow-lg z-10 ${
              isDarkMode
                ? 'bg-white text-black hover:bg-gray-200'
                : 'bg-black text-white hover:bg-gray-800'
            }`}
            aria-label="Close"
          >
            <X size={24} />
          </button>
        }

        <div className="flex flex-col items-center">
          <h1
            className={`text-4xl md:text-5xl font-bold mb-16 ${
              isDarkMode ? 'text-white' : 'text-black'
            }`}
          >
            Who's working out?
          </h1>

          <div className="flex gap-8 md:gap-12 flex-wrap justify-center">
            {users.map((user) => (
              <div key={user.name} className="relative">
                <button
                  onClick={() => handleSelectUser(user.name)}
                  className="flex flex-col items-center group cursor-pointer"
                >
                  {/* Avatar Circle */}
                  <div
                    className={`w-32 h-32 md:w-40 md:h-40 rounded-full flex items-center justify-center transition-all duration-300 border-4 group-hover:scale-110 ${
                      isDarkMode
                        ? 'border-gray-700 group-hover:border-gray-500'
                        : 'border-gray-300 group-hover:border-gray-500'
                    }`}
                    style={{ backgroundColor: user.color }}
                  >
                    <span className="text-white text-4xl md:text-5xl font-semibold">
                      {user.name.trim().charAt(0).toUpperCase()}
                    </span>
                  </div>

                  {/* User Name */}
                  <span
                    className={`mt-4 text-xl md:text-2xl font-semibold transition-opacity duration-300 group-hover:opacity-70 ${
                      isDarkMode ? 'text-white' : 'text-black'
                    }`}
                  >
                    {user.name}
                  </span>
                </button>

                {
                  <div className="absolute -top-2 -right-2">
                    {deleteConfirm === user.name ? (
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => confirmDelete(user.name, e)}
                          className={`p-2 rounded-full shadow-lg transition-all duration-300 ${
                            isDarkMode
                              ? 'bg-red-600 hover:bg-red-700 text-white'
                              : 'bg-red-500 hover:bg-red-600 text-white'
                          }`}
                          aria-label="Confirm delete"
                          title="Confirm delete"
                        >
                          <Trash2 size={16} />
                        </button>
                        <button
                          onClick={cancelDelete}
                          className={`p-2 rounded-full shadow-lg transition-all duration-300 ${
                            isDarkMode
                              ? 'bg-gray-700 hover:bg-gray-600 text-white'
                              : 'bg-gray-300 hover:bg-gray-400 text-black'
                          }`}
                          aria-label="Cancel"
                          title="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => handleDeleteClick(user.name, e)}
                        className={`p-2 rounded-full shadow-lg transition-all duration-300 hover:scale-110 ${
                          isDarkMode
                            ? 'bg-gray-800 hover:bg-red-600 text-white'
                            : 'bg-gray-200 hover:bg-red-500 text-black hover:text-white'
                        }`}
                        aria-label="Delete user"
                        title="Delete user"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                }
              </div>
            ))}

            {/* Add User Button */}
            {
              <button
                onClick={() => setShowAddUserModal(true)}
                className="flex flex-col items-center group cursor-pointer"
              >
                {/* Add Button Circle */}
                <div
                  className={`w-32 h-32 md:w-40 md:h-40 rounded-full flex items-center justify-center transition-all duration-300 border-4 border-dashed group-hover:scale-110 ${
                    isDarkMode
                      ? 'border-gray-700 group-hover:border-gray-500 bg-gray-900'
                      : 'border-gray-300 group-hover:border-gray-500 bg-gray-50'
                  }`}
                >
                  <Plus
                    size={64}
                    className={isDarkMode ? 'text-gray-600' : 'text-gray-400'}
                    strokeWidth={2}
                  />
                </div>

                {/* Label */}
                <span
                  className={`mt-4 text-xl md:text-2xl font-semibold transition-opacity duration-300 group-hover:opacity-70 ${
                    isDarkMode ? 'text-gray-500' : 'text-gray-400'
                  }`}
                >
                  Add User
                </span>
              </button>
            }
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      <AddUserModal
        isOpen={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        onAddUser={addUser}
      />
    </>
  );
}
