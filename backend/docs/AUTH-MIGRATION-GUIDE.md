# Auth Module Migration Guide

This guide helps you migrate to the new secure auth system with backend-driven permissions.

## Overview

The new auth system implements:
- JWT tokens without roles/permissions (Zero-Trust model)
- Backend-driven permission system
- Session-based authorization
- Token revocation support
- Secure token management

## Migration Steps

### 1. Update Prisma Schema

Run the migration to add new tables:

```bash
pnpm --filter @quellwerk/backend exec prisma migrate dev --name add_secure_token_tables
```

This will create:
- `revoked_tokens` - For token revocation
- `temp_tokens` - For temporary tokens
- Updated `sessions` table with metadata

### 2. Update Environment Variables

Add these to your `.env` file:

```env
# JWT Configuration
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-key-min-32-chars
JWT_ISSUER=auth-module
JWT_AUDIENCE=quellwerk

# Token Expiry
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

### 3. Seed Initial Data

Ensure roles and permissions are properly seeded:

```bash
SEED_ADMIN_PASSWORD='...' pnpm --filter @quellwerk/backend run prisma:seed
```

### 4. Update Auth Module Initialization

In your main app file:

```typescript
import { AuthModule } from './modules/auth/auth.module.js';

// Initialize Auth Module with new config
const authModule = new AuthModule({
  prismaClient: prisma,
  logger: logger,
  
  // JWT Settings (no roles in token!)
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: '15m',
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  refreshExpiresIn: '7d',
  jwtIssuer: 'auth-module',
  jwtAudience: 'quellwerk',
  
  // Other settings...
});

// Mount the module
authModule.mount(app, '/api/auth');
```

### 5. Update Authentication Middleware

Replace your old auth middleware with:

```typescript
import { SecureTokenService } from './modules/auth/services/secure-token.service.js';

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const secureTokenService = authModule.getServices().secureToken;
    const payload = await secureTokenService.verifySecureToken(token, 'access');
    
    // Only attach user ID and session ID
    req.user = {
      id: parseInt(payload.sub),
      sessionId: payload.sid
    };
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

### 6. Update Authorization Checks

Replace role checks in routes:

```typescript
// OLD - Role in token
if (!req.user.roles.includes('admin')) {
  return res.status(403).json({ error: 'Forbidden' });
}

// NEW - Permission check via backend
const permissionService = authModule.getServices().permission;
const hasAccess = await permissionService.verifyAccess(
  req.user.id,
  req.path,
  'view'
);

if (!hasAccess.allowed) {
  return res.status(403).json({ 
    error: 'Forbidden',
    reason: hasAccess.reason 
  });
}
```

### 7. Update Login Flow

The login response now returns minimal tokens:

```typescript
// Login endpoint
const result = await authService.login(email, password);

// Response structure
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "roles": ["employee"],      // Still returned for backward compatibility
    "permissions": ["read"]      // But NOT in the JWT token!
  },
  "tokens": {
    "accessToken": "eyJ...",     // Contains only: sub, jti, sid, type
    "refreshToken": "eyJ..."
  }
}
```

### 8. Test the Migration

1. **Test Login**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email": "admin@example.com", "password": "Admin@123"}'
   ```

2. **Verify Token Content**:
   ```bash
   # Decode the JWT to ensure no roles/permissions
   echo $ACCESS_TOKEN | cut -d'.' -f2 | base64 -d | jq '.'
   ```

3. **Test Session Endpoint**:
   ```bash
   curl -X GET http://localhost:3000/api/auth/session \
     -H "Authorization: Bearer $ACCESS_TOKEN"
   ```

### 9. Frontend Updates

Update your frontend to:

1. Call `/api/auth/session` on app startup
2. Store permissions in Redux/State (NOT localStorage)
3. Use backend permission checks for route guards

### 10. Rollback Plan

If issues arise:

1. Keep old auth endpoints available at `/api/auth/v1/*`
2. Use feature flags to switch between old/new auth
3. Maintain backward compatibility for 30 days

## Common Issues

### Issue: "Token contains roles"
**Solution**: Ensure you're using `SecureTokenService` not the old `TokenService`.

### Issue: "Permission denied for all routes"
**Solution**: Check that user roles are properly assigned in the database.

### Issue: "Session endpoint returns 401"
**Solution**: Verify the JWT secret matches between token generation and verification.

## Performance Considerations

1. **Session Caching**: The permission service should cache sessions for 5 minutes
2. **Database Indexes**: Ensure all foreign keys have indexes
3. **Connection Pooling**: Use appropriate Prisma connection limits

## Security Checklist

- [ ] All tokens use secure random IDs (jti)
- [ ] No roles/permissions in JWT payload
- [ ] Token revocation implemented
- [ ] Session metadata stores token IDs
- [ ] Audit logging for permission checks
- [ ] Rate limiting on auth endpoints
- [ ] HTTPS only in production

## Monitoring

Add monitoring for:
- Failed permission checks
- Token revocation events
- Unusual access patterns
- Session endpoint response times

## Support

For issues during migration:
1. Check logs: `tail -f logs/auth-module.log`
2. Verify database state: `pnpm --filter @quellwerk/backend exec prisma studio`
3. Test with curl commands from AUTH-API-TESTING.md












