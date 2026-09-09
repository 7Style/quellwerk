import { useState, useCallback } from 'react';
import { useCreateUserMutation, useUpdateUserMutation } from '../services';
import type { User, CreateUserDto, UpdateUserDto } from '../types';

interface UseUserFormOptions {
  user?: User;
  onSuccess?: (user: User) => void;
  onError?: (error: unknown) => void;
}

/**
 * Hook for user form logic
 * Handles create and update operations
 */
export function useUserForm(options: UseUserFormOptions = {}) {
  const { user, onSuccess, onError } = options;
  const isEditMode = Boolean(user);

  const [createUser, { isLoading: isCreating }] = useCreateUserMutation();
  const [updateUser, { isLoading: isUpdating }] = useUpdateUserMutation();

  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (data: CreateUserDto | UpdateUserDto) => {
      setFormError(null);

      try {
        let result: User;

        if (isEditMode && user) {
          const response = await updateUser({
            id: user.id,
            data: data as UpdateUserDto,
          }).unwrap();
          result = response.data;
        } else {
          const response = await createUser(data as CreateUserDto).unwrap();
          result = response.data;
        }

        onSuccess?.(result);
        return result;
      } catch (error) {
        const message = getErrorMessage(error);
        setFormError(message);
        onError?.(error);
        throw error;
      }
    },
    [isEditMode, user, createUser, updateUser, onSuccess, onError]
  );

  const clearError = useCallback(() => {
    setFormError(null);
  }, []);

  return {
    isEditMode,
    isSubmitting: isCreating || isUpdating,
    formError,
    handleSubmit,
    clearError,
  };
}

/**
 * Extract error message from API error
 */
function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const apiError = error as { data?: { error?: { message?: string } } };
    if (apiError.data?.error?.message) {
      return apiError.data.error.message;
    }
  }
  return 'An unexpected error occurred';
}
