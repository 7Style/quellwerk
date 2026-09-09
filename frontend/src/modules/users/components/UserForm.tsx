'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { useUserForm } from '../hooks/useUserForm';
import { useTranslation } from '../i18n/useTranslation';
import type { User, CreateUserDto } from '../types';

interface UserFormProps {
  isOpen: boolean;
  user?: User;
  onClose: () => void;
  onSuccess?: (user: User) => void;
}

interface FormData extends Omit<CreateUserDto, 'roleIds' | 'clientId' | 'password'> {
  password?: string;
  confirmPassword?: string;
}

/**
 * UserForm - Business logic component for user creation/editing
 * Design elements have been stripped - implement your own styling
 */
export const UserForm: React.FC<UserFormProps> = ({ isOpen, user, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const { isEditMode, isSubmitting, formError, handleSubmit, clearError } = useUserForm({
    user,
    onSuccess: (result) => {
      onSuccess?.(result);
      onClose();
    },
  });

  const {
    register,
    handleSubmit: rhfHandleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<FormData>({
    defaultValues: user
      ? {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone ?? '',
          department: user.department ?? '',
          position: user.position ?? '',
          isActive: user.isActive,
          preferredLanguage: user.preferredLanguage,
          loginSecurityMode: user.loginSecurityMode,
        }
      : {
          email: '',
          password: '',
          confirmPassword: '',
          firstName: '',
          lastName: '',
          phone: '',
          department: '',
          position: '',
          isActive: true,
          preferredLanguage: 'de',
          loginSecurityMode: 'none',
        },
  });

  const password = watch('password');

  const onSubmit = async (data: FormData) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { confirmPassword, ...submitData } = data;

    // Remove password fields for edit mode if not provided
    if (isEditMode && !submitData.password) {
      delete submitData.password;
    }

    await handleSubmit(submitData);
  };

  const handleClose = () => {
    reset();
    clearError();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="user-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="user-form-modal__header">
          <h2 className="user-form-modal__title">
            {isEditMode ? t('form.editTitle') : t('form.createTitle')}
          </h2>
          <button
            type="button"
            className="user-form-modal__close"
            onClick={handleClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="user-form-modal__description">
          {isEditMode ? t('form.editDescription') : t('form.createDescription')}
        </p>

        <form onSubmit={rhfHandleSubmit(onSubmit)}>
          {formError && (
            <div role="alert">
              <span>{formError}</span>
            </div>
          )}

          {/* Name Fields */}
          <div>
            <div>
              <label htmlFor="firstName">{t('fields.firstName')} *</label>
              <input
                id="firstName"
                type="text"
                placeholder={t('form.firstNamePlaceholder')}
                {...register('firstName', { required: t('validation.firstNameRequired') })}
              />
              {errors.firstName && <span role="alert">{errors.firstName.message}</span>}
            </div>

            <div>
              <label htmlFor="lastName">{t('fields.lastName')} *</label>
              <input
                id="lastName"
                type="text"
                placeholder={t('form.lastNamePlaceholder')}
                {...register('lastName', { required: t('validation.lastNameRequired') })}
              />
              {errors.lastName && <span role="alert">{errors.lastName.message}</span>}
            </div>
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email">{t('fields.email')} *</label>
            <input
              id="email"
              type="email"
              placeholder={t('form.emailPlaceholder')}
              {...register('email', {
                required: t('validation.emailRequired'),
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: t('validation.emailInvalid'),
                },
              })}
            />
            {errors.email && <span role="alert">{errors.email.message}</span>}
          </div>

          {/* Password (only for create mode or optional in edit) */}
          <div>
            <div>
              <label htmlFor="password">
                {t('fields.password')} {!isEditMode && '*'}
              </label>
              <input
                id="password"
                type="password"
                placeholder={
                  isEditMode ? t('form.passwordPlaceholderEdit') : t('form.passwordPlaceholder')
                }
                {...register('password', {
                  required: !isEditMode ? t('validation.passwordRequired') : false,
                  minLength: {
                    value: 6,
                    message: t('validation.passwordMinLength'),
                  },
                })}
              />
              {errors.password && <span role="alert">{errors.password.message}</span>}
            </div>

            <div>
              <label htmlFor="confirmPassword">
                {t('fields.confirmPassword')} {!isEditMode && '*'}
              </label>
              <input
                id="confirmPassword"
                type="password"
                placeholder={t('form.confirmPasswordPlaceholder')}
                {...register('confirmPassword', {
                  required: !isEditMode ? t('validation.confirmPasswordRequired') : false,
                  validate: (value) =>
                    !password || value === password || t('validation.passwordMismatch'),
                })}
              />
              {errors.confirmPassword && <span role="alert">{errors.confirmPassword.message}</span>}
            </div>
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone">{t('fields.phone')}</label>
            <input
              id="phone"
              type="tel"
              placeholder={t('form.phonePlaceholder')}
              {...register('phone')}
            />
          </div>

          {/* Department & Position */}
          <div>
            <div>
              <label htmlFor="department">{t('fields.department')}</label>
              <input
                id="department"
                type="text"
                placeholder={t('form.departmentPlaceholder')}
                {...register('department')}
              />
            </div>

            <div>
              <label htmlFor="position">{t('fields.position')}</label>
              <input
                id="position"
                type="text"
                placeholder={t('form.positionPlaceholder')}
                {...register('position')}
              />
            </div>
          </div>

          {/* Language & Status */}
          <div>
            <div>
              <label htmlFor="preferredLanguage">{t('fields.language')}</label>
              <select id="preferredLanguage" {...register('preferredLanguage')}>
                <option value="de">{t('languages.de')}</option>
                <option value="en">{t('languages.en')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="isActive">{t('fields.status')}</label>
              <select id="isActive" {...register('isActive')}>
                <option value="true">{t('status.active')}</option>
                <option value="false">{t('status.inactive')}</option>
              </select>
            </div>
          </div>

          <div className="user-form__footer">
            <button type="button" className="btn btn--secondary" onClick={handleClose}>
              {t('actions.cancel')}
            </button>
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? t('actions.saving')
                : isEditMode
                  ? t('actions.update')
                  : t('actions.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
