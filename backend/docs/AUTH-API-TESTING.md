# Auth API Testing with CURL

This document provides CURL commands to test the new security-focused Auth API endpoints.

## Prerequisites

1. Backend running on `http://localhost:3011`
2. Valid user credentials
3. `jq` installed for JSON formatting (optional)

## Environment Variables

```bash
# Set these for easier testing
export API_URL="http://localhost:3011/api/auth"
export ACCESS_TOKEN=""  # Will be set after login
```

## 1. Login (Get Access Token)

```bash
# Login as employee
curl -X POST "$API_URL/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "employee@example.com",
    "password": "password123"
  }' | jq '.'

# Login as platform manager
curl -X POST "$API_URL/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "manager@example.com",
    "password": "password123"
  }' | jq '.'

# Login as super admin
curl -X POST "$API_URL/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin@123"
  }' | jq '.'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "email": "admin@example.com",
      "roles": ["super-admin"],
      "permissions": ["*"]
    },
    "tokens": {
      "accessToken": "eyJ...",
      "refreshToken": "eyJ..."
    }
  }
}
```

**Note:** The token now contains only user ID and session ID, no roles/permissions!

## 2. Get Session with Permissions

```bash
# Set the token from login response
export ACCESS_TOKEN="eyJ..."

# Get full session with permissions
curl -X GET "$API_URL/session" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "email": "admin@example.com",
      "firstName": "Admin",
      "lastName": "User",
      "lastLogin": "2024-01-01T10:00:00Z"
    },
    "permissions": {
      "role": "super-admin",
      "modules": ["dashboard", "clients", "consultants", "projects", "employees", "documents", "costs", "holidays", "access-rights", "system-settings", "logs", "help"],
      "actions": ["create", "read", "update", "delete"],
      "dataScopes": {
        "projects": ["all"],
        "clients": ["all"],
        "system": ["all"]
      }
    },
    "navigation": [
      { "path": "/dashboard", "label": "Dashboard", "icon": "home" },
      { "path": "/clients", "label": "Clients", "icon": "users" },
      { "path": "/consultants", "label": "Consultants", "icon": "briefcase" },
      { "path": "/projects", "label": "Projects", "icon": "folder" },
      { "path": "/employees", "label": "Employees", "icon": "user-check" },
      { "path": "/documents", "label": "Documents", "icon": "file-text" },
      { "path": "/costs", "label": "Costs", "icon": "dollar-sign" },
      { "path": "/holidays", "label": "Holidays", "icon": "calendar" },
      { "path": "/access-rights", "label": "Access Rights", "icon": "shield" },
      { "path": "/system-settings", "label": "System Settings", "icon": "settings" },
      { "path": "/logs", "label": "Logs", "icon": "list" },
      { "path": "/help", "label": "Help", "icon": "help-circle" }
    ]
  }
}
```

## 3. Verify Access to Resource

```bash
# Check access to clients module
curl -X POST "$API_URL/verify-access" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "/clients",
    "action": "view"
  }' | jq '.'

# Check access to system-settings (only super-admin)
curl -X POST "$API_URL/verify-access" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "/system-settings",
    "action": "view"
  }' | jq '.'
```

**Expected Response (Allowed):**
```json
{
  "success": true,
  "data": {
    "allowed": true
  }
}
```

**Expected Response (Denied):**
```json
{
  "success": true,
  "data": {
    "allowed": false,
    "reason": "Role 'employee' does not have access to module 'system-settings'",
    "requiredRole": "super-admin"
  }
}
```

## 4. Get Navigation

```bash
# Get navigation items for current user
curl -X GET "$API_URL/navigation" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    { "path": "/dashboard", "label": "Dashboard", "icon": "home" },
    { "path": "/employees", "label": "Employees", "icon": "user-check" },
    { "path": "/documents", "label": "Documents", "icon": "file-text" },
    { "path": "/holidays", "label": "Holidays", "icon": "calendar" },
    { "path": "/help", "label": "Help", "icon": "help-circle" }
  ]
}
```

## 5. Get All Permissions

```bash
# Get all permissions for current user
curl -X GET "$API_URL/permissions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "role": "employee",
    "modules": ["dashboard", "employees", "documents", "holidays", "help"],
    "actions": ["read"],
    "dataScopes": {}
  }
}
```

## 6. Check Specific Permission

```bash
# Check if user has specific permission
curl -X GET "$API_URL/permissions/users:create" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "permission": "users:create",
    "allowed": false
  }
}
```

## 7. Test Token Without Roles (Security Check)

Decode the JWT token to verify it doesn't contain roles/permissions:

```bash
# Decode the JWT payload (base64)
echo $ACCESS_TOKEN | cut -d'.' -f2 | base64 -d | jq '.'
```

**Expected Payload:**
```json
{
  "sub": "1",
  "jti": "abc123def456",
  "sid": "session-123",
  "type": "access",
  "iat": 1704103200,
  "exp": 1704104100,
  "iss": "auth-module",
  "aud": "bp-monolith"
}
```

**Note:** No roles or permissions in the token!

## 8. Test Unauthorized Access

```bash
# Try to access without token
curl -X GET "$API_URL/session" | jq '.'
```

**Expected Response:**
```json
{
  "error": "No token provided"
}
```

## 9. Test with Expired Token

```bash
# Use an expired token
curl -X GET "$API_URL/session" \
  -H "Authorization: Bearer eyJ..." | jq '.'
```

**Expected Response:**
```json
{
  "error": "Invalid token"
}
```

## Testing Different Roles

### Employee Test Flow
```bash
# 1. Login as employee
# 2. Get session - should see limited navigation
# 3. Try to access /clients - should be denied
# 4. Try to access /employees - should be allowed
```

### Platform Manager Test Flow
```bash
# 1. Login as platform manager
# 2. Get session - should see more navigation items
# 3. Try to access /clients - should be allowed
# 4. Try to access /system-settings - should be denied
```

### Super Admin Test Flow
```bash
# 1. Login as super admin
# 2. Get session - should see all navigation items
# 3. Try to access any resource - should be allowed
# 4. Check permissions - should have wildcard "*"
```

## Common Issues and Solutions

1. **Token Expired**: Tokens expire after 15 minutes. Login again to get a new token.

2. **Permission Denied**: Check that the user has the correct role in the database.

3. **No Navigation Items**: Ensure the role mappings are correctly configured in the PermissionService.

4. **Invalid Token**: Make sure you're using the accessToken, not the refreshToken.

## Database Verification

To verify the user roles in the database:

```sql
-- Check user roles
SELECT u.email, r.name as role_name 
FROM users u 
JOIN user_roles ur ON u.id = ur.user_id 
JOIN roles r ON ur.role_id = r.id
ORDER BY u.email;

-- Check role permissions
SELECT r.name as role_name, p.name as permission_name
FROM roles r
JOIN role_permissions rp ON r.id = rp.role_id
JOIN permissions p ON rp.permission_id = p.id
ORDER BY r.name, p.name;
```

## Performance Testing

Test the permission check performance:

```bash
# Time 100 session requests
time for i in {1..100}; do
  curl -s -X GET "$API_URL/session" \
    -H "Authorization: Bearer $ACCESS_TOKEN" > /dev/null
done
```

This should complete in under 5 seconds for optimal performance.












