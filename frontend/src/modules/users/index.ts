// Pages
export { UsersPage } from './pages/UsersPage';

// Components
export { UserForm } from './components';

// Hooks
export { useUserForm } from './hooks';

// Services (RTK Query API)
export {
  usersApi,
  useGetUsersQuery,
  useGetUserByIdQuery,
  useGetUserProfileQuery,
  useGetRolesQuery,
  useGetMetadataQuery,
  useGetStatisticsQuery,
  useLazyGetUsersQuery,
  useLazyGetUserByIdQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useUpdateMeMutation,
  useDeleteUserMutation,
  useUpdateUserPasswordMutation,
  useUpdateMyPasswordMutation,
  useAssignRolesMutation,
  useRemoveRoleMutation,
  useBulkDeactivateMutation,
} from './services';

// Types
export type {
  User,
  Role,
  Department,
  LoginMode,
  UserMetadata,
  UserStatistics,
  UserSortBy,
  SortOrder,
  QueryUserParams,
  PaginatedResponse,
  ApiResponse,
  CreateUserDto,
  UpdateUserDto,
  UpdatePasswordDto,
  AssignRolesDto,
  BulkDeactivateDto,
} from './types';
