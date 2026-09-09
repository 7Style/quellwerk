import { baseApi } from '@/lib/api';
import type {
  User,
  Role,
  UserMetadata,
  UserStatistics,
  QueryUserParams,
  PaginatedResponse,
  ApiResponse,
  CreateUserDto,
  UpdateUserDto,
  UpdatePasswordDto,
  AssignRolesDto,
  BulkDeactivateDto,
} from '../types';

/**
 * Users API - RTK Query endpoints
 */
export const usersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // ─────────────────────────────────────────────────────────────
    // Query endpoints
    // ─────────────────────────────────────────────────────────────

    /**
     * Get paginated list of users
     */
    getUsers: builder.query<PaginatedResponse<User>, QueryUserParams | void>({
      query: (params) => ({
        url: '/api/users',
        params: params ?? {},
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.data.map(({ id }) => ({ type: 'User' as const, id })),
              { type: 'User', id: 'LIST' },
            ]
          : [{ type: 'User', id: 'LIST' }],
    }),

    /**
     * Get single user by ID
     */
    getUserById: builder.query<ApiResponse<User>, number>({
      query: (id) => `/api/users/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'User', id }],
    }),

    /**
     * Get current user profile (from users module)
     */
    getUserProfile: builder.query<ApiResponse<User>, void>({
      query: () => '/api/users/me',
      providesTags: [{ type: 'User', id: 'PROFILE' }],
    }),

    /**
     * Get all available roles
     */
    getRoles: builder.query<ApiResponse<Role[]>, void>({
      query: () => '/api/users/roles',
      providesTags: [{ type: 'Role', id: 'LIST' }],
    }),

    /**
     * Get user metadata (departments, login modes)
     */
    getMetadata: builder.query<ApiResponse<UserMetadata>, void>({
      query: () => '/api/users/metadata',
      providesTags: [{ type: 'Metadata', id: 'USER' }],
    }),

    /**
     * Get user statistics
     */
    getStatistics: builder.query<ApiResponse<UserStatistics>, void>({
      query: () => '/api/users/statistics',
      providesTags: [{ type: 'User', id: 'STATS' }],
    }),

    // ─────────────────────────────────────────────────────────────
    // Mutation endpoints
    // ─────────────────────────────────────────────────────────────

    /**
     * Create new user
     */
    createUser: builder.mutation<ApiResponse<User>, CreateUserDto>({
      query: (body) => ({
        url: '/api/users',
        method: 'POST',
        body,
      }),
      invalidatesTags: [
        { type: 'User', id: 'LIST' },
        { type: 'User', id: 'STATS' },
      ],
    }),

    /**
     * Update user by ID
     */
    updateUser: builder.mutation<ApiResponse<User>, { id: number; data: UpdateUserDto }>({
      query: ({ id, data }) => ({
        url: `/api/users/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'User', id },
        { type: 'User', id: 'LIST' },
      ],
    }),

    /**
     * Update current user profile
     */
    updateMe: builder.mutation<ApiResponse<User>, UpdateUserDto>({
      query: (data) => ({
        url: '/api/users/me',
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: [{ type: 'User', id: 'ME' }],
    }),

    /**
     * Delete user by ID
     */
    deleteUser: builder.mutation<ApiResponse<void>, number>({
      query: (id) => ({
        url: `/api/users/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [
        { type: 'User', id: 'LIST' },
        { type: 'User', id: 'STATS' },
      ],
    }),

    /**
     * Update user password (admin)
     */
    updateUserPassword: builder.mutation<
      ApiResponse<void>,
      { id: number; data: UpdatePasswordDto }
    >({
      query: ({ id, data }) => ({
        url: `/api/users/${id}/password`,
        method: 'PUT',
        body: data,
      }),
    }),

    /**
     * Update current user password
     */
    updateMyPassword: builder.mutation<ApiResponse<void>, UpdatePasswordDto>({
      query: (data) => ({
        url: '/api/users/me/password',
        method: 'PUT',
        body: data,
      }),
    }),

    /**
     * Assign roles to user
     */
    assignRoles: builder.mutation<ApiResponse<void>, { id: number; data: AssignRolesDto }>({
      query: ({ id, data }) => ({
        url: `/api/users/${id}/roles`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'User', id }],
    }),

    /**
     * Remove role from user
     */
    removeRole: builder.mutation<ApiResponse<void>, { userId: number; roleId: number }>({
      query: ({ userId, roleId }) => ({
        url: `/api/users/${userId}/roles/${roleId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { userId }) => [{ type: 'User', id: userId }],
    }),

    /**
     * Bulk deactivate users
     */
    bulkDeactivate: builder.mutation<ApiResponse<{ deactivatedCount: number }>, BulkDeactivateDto>({
      query: (data) => ({
        url: '/api/users/bulk-deactivate',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [
        { type: 'User', id: 'LIST' },
        { type: 'User', id: 'STATS' },
      ],
    }),
  }),
});

// Export hooks for usage in components
export const {
  // Queries
  useGetUsersQuery,
  useGetUserByIdQuery,
  useGetUserProfileQuery,
  useGetRolesQuery,
  useGetMetadataQuery,
  useGetStatisticsQuery,
  // Lazy queries (for programmatic fetching)
  useLazyGetUsersQuery,
  useLazyGetUserByIdQuery,
  // Mutations
  useCreateUserMutation,
  useUpdateUserMutation,
  useUpdateMeMutation,
  useDeleteUserMutation,
  useUpdateUserPasswordMutation,
  useUpdateMyPasswordMutation,
  useAssignRolesMutation,
  useRemoveRoleMutation,
  useBulkDeactivateMutation,
} = usersApi;
