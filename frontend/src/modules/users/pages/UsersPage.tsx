'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useGetUsersQuery, useDeleteUserMutation } from '../services';
import { useAppSelector } from '@/store';
import { useTranslation } from '../i18n';
import { UserForm } from '../components';
import type { User, QueryUserParams } from '../types';

interface FormState {
  isOpen: boolean;
  user?: User;
}

export const UsersPage: React.FC = () => {
  const { t } = useTranslation();
  const { isAuthenticated } = useAppSelector((state) => state.auth);

  const [queryParams, setQueryParams] = useState<QueryUserParams>({
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const [formState, setFormState] = useState<FormState>({
    isOpen: false,
    user: undefined,
  });

  // Skip query if not authenticated
  const { data, isLoading, isError, error, refetch } = useGetUsersQuery(queryParams, {
    skip: !isAuthenticated,
  });
  const [deleteUser, { isLoading: isDeleting }] = useDeleteUserMutation();

  const users = useMemo(() => data?.data ?? [], [data?.data]);
  const pagination = data?.pagination;

  const getInitials = (firstName: string, lastName: string): string => {
    return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
  };

  const getFullName = (user: User): string => {
    return `${user.firstName} ${user.lastName}`.trim();
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('de-DE');
  };

  const handleAddUser = useCallback(() => {
    setFormState({ isOpen: true, user: undefined });
  }, []);

  const handleExport = useCallback(() => {
    // Export users as CSV
    if (users.length === 0) return;

    const headers = [
      'ID',
      'First Name',
      'Last Name',
      'Email',
      'Department',
      'Position',
      'Status',
      'Join Date',
    ];
    const rows = users.map((user) => [
      user.id,
      user.firstName,
      user.lastName,
      user.email,
      user.department ?? '',
      user.position ?? '',
      user.isActive ? 'Active' : 'Inactive',
      new Date(user.createdAt).toLocaleDateString('de-DE'),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `users-export-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [users]);

  const handleEdit = useCallback((user: User) => {
    setFormState({ isOpen: true, user });
  }, []);

  const handleDelete = useCallback(
    async (userId: number) => {
      if (!confirm(t('messages.deleteConfirm'))) return;

      try {
        await deleteUser(userId).unwrap();
      } catch (err) {
        console.error('Failed to delete user:', err);
      }
    },
    [deleteUser, t]
  );

  const handlePageChange = useCallback((newPage: number) => {
    setQueryParams((prev) => ({ ...prev, page: newPage }));
  }, []);

  const handleFormClose = useCallback(() => {
    setFormState({ isOpen: false, user: undefined });
  }, []);

  const handleFormSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  // Not authenticated state
  if (!isAuthenticated) {
    return (
      <div className="users">
        <div className="users__header">
          <h2 className="users__title">{t('title')}</h2>
        </div>
        <div className="users__error">
          <p>{t('messages.loginRequired')}</p>
          <p className="users__error-detail">{t('messages.loginRequiredDetail')}</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="users">
        <div className="users__header">
          <h2 className="users__title">{t('title')}</h2>
        </div>
        <div className="users__loading">
          <p>{t('messages.loading')}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="users">
        <div className="users__header">
          <h2 className="users__title">{t('title')}</h2>
        </div>
        <div className="users__error">
          <p>{t('messages.loadError')}</p>
          <p className="users__error-detail">
            {(error as { data?: { error?: { message?: string } } })?.data?.error?.message ??
              t('messages.unknownError')}
          </p>
          <button className="btn btn--primary" onClick={() => refetch()}>
            {t('actions.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="users">
      <div className="users__header">
        <h2 className="users__title">{t('title')}</h2>
        <div className="users__actions">
          <button
            className="btn btn--secondary"
            onClick={handleExport}
            disabled={users.length === 0}
          >
            {t('actions.export')}
          </button>
          <button className="btn btn--primary" onClick={handleAddUser}>
            {t('actions.add')}
          </button>
        </div>
      </div>

      <div className="users-table">
        <div className="users-table__wrapper">
          <table className="users-table__table">
            <thead className="users-table__header">
              <tr>
                <th className="users-table__header-cell">{t('fields.user')}</th>
                <th className="users-table__header-cell">{t('fields.department')}</th>
                <th className="users-table__header-cell">{t('fields.status')}</th>
                <th className="users-table__header-cell">{t('fields.joinDate')}</th>
                <th className="users-table__header-cell">{t('fields.actions')}</th>
              </tr>
            </thead>
            <tbody className="users-table__body">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="users-table__empty">
                    {t('messages.noUsers')}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="users-table__row">
                    <td className="users-table__cell">
                      <div className="user-info">
                        <div className="user-avatar">
                          {getInitials(user.firstName, user.lastName)}
                        </div>
                        <div className="user-info__details">
                          <div className="user-info__name">{getFullName(user)}</div>
                          <div className="user-info__email">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="users-table__cell">{user.department ?? user.position ?? '-'}</td>
                    <td className="users-table__cell">
                      <span
                        className={`badge ${user.isActive ? 'badge--active' : 'badge--inactive'}`}
                      >
                        {user.isActive ? t('status.active') : t('status.inactive')}
                      </span>
                    </td>
                    <td className="users-table__cell">{formatDate(user.createdAt)}</td>
                    <td className="users-table__cell">
                      <div className="user-actions">
                        <button
                          className="user-actions__button"
                          onClick={() => handleEdit(user)}
                          aria-label={t('actions.edit')}
                        >
                          Edit
                        </button>
                        <button
                          className="user-actions__button"
                          onClick={() => handleDelete(user.id)}
                          aria-label={t('actions.delete')}
                          disabled={isDeleting}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="users-pagination">
            <button
              className="users-pagination__btn"
              disabled={pagination.page <= 1}
              onClick={() => handlePageChange(pagination.page - 1)}
            >
              {t('pagination.previous')}
            </button>
            <span className="users-pagination__info">
              {t('pagination.page')} {pagination.page} {t('pagination.of')} {pagination.totalPages}
            </span>
            <button
              className="users-pagination__btn"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => handlePageChange(pagination.page + 1)}
            >
              {t('pagination.next')}
            </button>
          </div>
        )}
      </div>

      {/* User Form Modal */}
      <UserForm
        isOpen={formState.isOpen}
        user={formState.user}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
};
