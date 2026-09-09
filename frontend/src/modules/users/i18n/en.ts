/**
 * English translations for Users module
 */
export const en = {
  // Page
  title: 'Team Management',
  subtitle: 'Manage your team',

  // Status
  status: {
    active: 'Active',
    inactive: 'Inactive',
  },

  // Fields
  fields: {
    user: 'User',
    email: 'Email',
    firstName: 'First Name',
    lastName: 'Last Name',
    department: 'Department',
    position: 'Position',
    status: 'Status',
    joinDate: 'Join Date',
    actions: 'Actions',
    role: 'Role',
    phone: 'Phone',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    language: 'Language',
  },

  // Languages
  languages: {
    en: 'English',
    de: 'German',
  },

  // Actions
  actions: {
    add: 'Add User',
    edit: 'Edit',
    delete: 'Delete',
    export: 'Export',
    save: 'Save',
    cancel: 'Cancel',
    retry: 'Retry',
    saving: 'Saving...',
    create: 'Create User',
    update: 'Update User',
  },

  // Form
  form: {
    createTitle: 'Create User',
    createDescription: 'Add a new team member to your organization.',
    editTitle: 'Edit User',
    editDescription: 'Update the user information.',
    firstNamePlaceholder: 'John',
    lastNamePlaceholder: 'Doe',
    emailPlaceholder: 'john.doe@example.com',
    passwordPlaceholder: 'Enter password',
    passwordPlaceholderEdit: 'Leave empty to keep current',
    confirmPasswordPlaceholder: 'Confirm password',
    phonePlaceholder: '+49 123 456789',
    departmentPlaceholder: 'Engineering',
    positionPlaceholder: 'Software Developer',
  },

  // Validation
  validation: {
    firstNameRequired: 'First name is required',
    lastNameRequired: 'Last name is required',
    emailRequired: 'Email is required',
    emailInvalid: 'Invalid email address',
    passwordRequired: 'Password is required',
    passwordMinLength: 'Password must be at least 6 characters',
    confirmPasswordRequired: 'Please confirm your password',
    passwordMismatch: 'Passwords do not match',
  },

  // Pagination
  pagination: {
    previous: 'Previous',
    next: 'Next',
    page: 'Page',
    of: 'of',
  },

  // Messages
  messages: {
    loading: 'Loading users...',
    noUsers: 'No users found',
    loadError: 'Error loading users',
    unknownError: 'Unknown error',
    deleteConfirm: 'Are you sure you want to delete this user?',
    loginRequired: 'Please log in',
    loginRequiredDetail: 'You must be logged in to manage users.',
    createSuccess: 'User created successfully',
    updateSuccess: 'User updated successfully',
    deleteSuccess: 'User deleted successfully',
  },
};
