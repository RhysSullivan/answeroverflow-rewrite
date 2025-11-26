# Convex Authentication Internals

## Summary

This document details how Convex authentication works internally, based on analysis of the vendored `convex-backend` and `convex-js` repositories.

## 1. How `ctx.auth.getUserIdentity()` Works

### Internal Flow

1. **Client-side**: When you call `ctx.auth.getUserIdentity()`, it triggers a syscall:
   ```typescript
   // convex-js/src/server/impl/authentication_impl.ts
   getUserIdentity: async () => {
     return await performAsyncSyscall("1.0/getUserIdentity", { requestId });
   }
   ```

2. **Server-side syscall handler** (`isolate/src/environment/udf/async_syscall.rs`):
   ```rust
   "1.0/getUserIdentity" => {
     provider.observe_identity()?;  // Marks that this function depends on identity
     let tx = provider.tx()?;
     let user_identity = tx.user_identity();  // Gets identity from transaction context
     if let Some(user_identity) = user_identity {
       return user_identity.try_into();  // Convert to JS-compatible format
     }
     Ok(JsonValue::Null)  // Returns null if no identity
   }
   ```

3. **What it returns**: A `UserIdentity` object with fields:
   - `tokenIdentifier` (guaranteed) - combination of `subject` + `issuer`
   - `subject` (guaranteed) - JWT `sub` claim
   - `issuer` (guaranteed) - JWT `iss` claim
   - Optional OIDC standard claims: `name`, `email`, `pictureUrl`, etc.
   - Custom claims as additional properties

### Important Notes

- `getUserIdentity()` returns `null` for queries/mutations/actions when no auth
- For HTTP Actions, it **throws** when no auth (different behavior!)
- The function is marked as "observing identity" for caching/invalidation purposes

## 2. How `client.setAuth(tokenFetcher)` Works

### Client-Side Flow (`AuthenticationManager`)

1. **Token Fetching**: The `AuthenticationManager` class handles auth state:
   ```typescript
   async setConfig(fetchToken: AuthTokenFetcher, onChange) {
     this.pauseSocket();
     const token = await fetchToken({ forceRefreshToken: false });
     if (token) {
       this.authenticate(token);  // Sends to server via WebSocket
     }
     this.resumeSocket();
   }
   ```

2. **WebSocket Message**: Token is sent via `ClientMessage::Authenticate`:
   ```rust
   ClientMessage::Authenticate {
     token: auth_token,
     base_version,
   }
   ```

3. **Server Validation**: The backend validates the token:
   ```rust
   let identity_result = self.api.authenticate(&self.host, RequestId::new(), auth_token).await;
   self.state.modify_identity(identity, base_version)?;
   ```

### Token Refresh

- Tokens are decoded using `jwt-decode`
- The manager schedules refresh based on `exp` and `iat` claims
- Refresh happens before expiration with configurable leeway
- Server confirmation is required before scheduling future refreshes

## 3. Identity Types in Convex

### The `Identity` Enum (Rust backend)

```rust
pub enum Identity {
    InstanceAdmin(AdminIdentity),  // Deploy key / admin access
    System(SystemIdentity),        // Internal system operations
    User(UserIdentity),            // Regular authenticated user (JWT)
    ActingUser(AdminIdentity, UserIdentityAttributes),  // Admin impersonating user
    Unknown(Option<ErrorMetadata>),  // No auth or auth error
}
```

### Key Methods

```rust
impl Identity {
    pub fn system() -> Self { Identity::System(SystemIdentity) }
    pub fn user(user: UserIdentity) -> Self { Identity::User(user) }
    pub fn is_system(&self) -> bool { ... }
    pub fn is_admin(&self) -> bool { ... }
}
```

## 4. System/Admin Auth - The Key Discovery

### Admin Key Authentication

The backend supports **admin keys** that create `Identity::InstanceAdmin` or `Identity::System`:

```rust
// keybroker/src/broker.rs
pub fn issue_system_key(&self) -> SystemKey {
    SystemKey::new(self.issue_key(None, false))  // None = system, not member
}

pub fn check_admin_key(&self, key: &str) -> anyhow::Result<Identity> {
    // ...decryption logic...
    Ok(match identity {
        AdminIdentityProto::MemberId(member_id) => Identity::InstanceAdmin(...),
        AdminIdentityProto::System(()) => Identity::system(),  // <-- SYSTEM IDENTITY
    })
}
```

### HTTP Client Admin Auth

```typescript
// convex-js/src/browser/http_client.ts
setAdminAuth(token: string, actingAsIdentity?: UserIdentityAttributes) {
    if (actingAsIdentity !== undefined) {
        const encoded = btoa(JSON.stringify(actingAsIdentity));
        this.adminAuth = `${token}:${encoded}`;  // Admin acting as user
    } else {
        this.adminAuth = token;  // Pure admin
    }
}

// In request:
if (this.adminAuth) {
    headers["Authorization"] = `Convex ${this.adminAuth}`;  // Note: "Convex" not "Bearer"
} else if (this.auth) {
    headers["Authorization"] = `Bearer ${this.auth}`;
}
```

### Authentication Flow for Admin Keys

```rust
// application/src/lib.rs
pub async fn authenticate(&self, token: AuthenticationToken, ...) {
    match token {
        AuthenticationToken::Admin(token, acting_as) => {
            let admin_identity = self.app_auth().check_key(token, instance_name).await?;
            match acting_as {
                Some(acting_user) => Identity::ActingUser(admin_identity, acting_user),
                None => admin_identity,  // Could be InstanceAdmin or System!
            }
        },
        AuthenticationToken::User(id_token) => {
            // ... validate JWT against auth providers
            Identity::user(validated_identity)
        },
        AuthenticationToken::None => Identity::Unknown(None),
    }
}
```

## 5. Practical Options for Backend-to-Convex Auth

### Option A: Deploy Key (Admin Auth) - RECOMMENDED

Use `ConvexHttpClient.setAdminAuth(deployKey)`:

```typescript
const client = new ConvexHttpClient(CONVEX_URL);
client.setAdminAuth(process.env.CONVEX_DEPLOY_KEY!);

// This gives you Identity::InstanceAdmin or Identity::System
// ctx.auth.getUserIdentity() returns null for admin identities
```

**Pros:**
- No JWT signing needed
- No database writes
- Works with internal functions
- Can impersonate users with `actingAsIdentity`

**Cons:**
- `ctx.auth.getUserIdentity()` returns `null` (not a user identity)
- Need to check for admin identity separately

### Option B: Admin Acting As User

```typescript
client.setAdminAuth(deployKey, {
    tokenIdentifier: "system|backend",
    subject: "backend",
    issuer: "system",
    // ... other attributes
});

// Creates Identity::ActingUser
// ctx.auth.getUserIdentity() returns the fake user attributes!
```

**Pros:**
- `ctx.auth.getUserIdentity()` returns the specified attributes
- No JWT validation needed
- Can set arbitrary user attributes

**Cons:**
- Still requires a deploy key
- The user doesn't exist in any auth provider

### Option C: System Key (Internal)

System keys create `Identity::System`:
```rust
pub fn issue_system_key(&self) -> SystemKey { ... }
```

**Note**: System keys are issued by the `KeyBroker` internally and aren't typically exposed to external clients. They're used for internal backend operations.

## 6. How Auth Providers are Configured

### `auth.config.ts`

```typescript
export default {
    providers: [
        {
            domain: "https://clerk.example.com",  // OIDC provider
            applicationID: "app-id",
        },
        {
            type: "customJwt",
            issuer: "https://custom.auth.com",
            jwks: "https://custom.auth.com/.well-known/jwks.json",
            algorithm: "RS256",
            applicationID: "optional-audience",
        }
    ]
} satisfies AuthConfig;
```

### Validation Logic

```rust
impl AuthInfo {
    pub fn matches_token(&self, audiences: &[String], issuer: &str) -> bool {
        // Check applicationID in JWT audiences
        // Check issuer matches domain (with some normalization)
    }
}
```

## 7. Recommended Approach for Your Use Case

Given your requirements:
- Backend calling public queries that require authentication
- No anonymous sessions in database
- No JWT signing overhead
- Minimal complexity

### Recommended: Admin + ActingAsUser Pattern

```typescript
// In your backend/server code
import { ConvexHttpClient } from "convex/browser";

const client = new ConvexHttpClient(process.env.CONVEX_URL!);

// Create a system user identity
client.setAdminAuth(process.env.CONVEX_DEPLOY_KEY!, {
    tokenIdentifier: "system|answeroverflow-backend",
    subject: "answeroverflow-backend",
    issuer: "system",
    name: "AnswerOverflow Backend",
});

// Now you can call public queries
const result = await client.query(api.public.someQuery, { ... });
// ctx.auth.getUserIdentity() will return the system user attributes
```

### Alternative: Modify Public Queries

If you don't want to use admin auth, modify your public queries to accept both:

```typescript
export const publicOrBackendQuery = query({
    args: { backendToken: v.optional(v.string()), /* other args */ },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        
        if (!identity) {
            // Check for backend token
            if (args.backendToken && args.backendToken === process.env.BACKEND_SECRET) {
                // Allowed as backend
            } else {
                throw new Error("Unauthorized");
            }
        }
        
        // ... rest of logic
    }
});
```

## Key Findings

1. **System Identity exists** but is for internal use only (not exposed via API)
2. **Admin keys can impersonate users** via the `actingAsIdentity` parameter
3. **`getUserIdentity()` returns null for admin/system** identities (by design)
4. **No JWT signing needed** when using admin auth with acting user
5. **No database writes** - the acting user is synthetic, not stored
