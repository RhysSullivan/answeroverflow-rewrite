# Centralized Data Visibility System

## Overview

The visibility system provides a centralized way to handle message and author visibility based on server preferences and user consent settings. All message data leaving Convex is automatically sanitized through this system.

## Architecture

### Core Components

1. **Visibility Context** (`packages/database/convex/shared/visibility.ts`)
   - Pure functions for computing visibility settings
   - Stateless transformers for sanitizing data
   - Type-safe schemas for sanitized data

2. **Visibility Types** (`packages/database/src/visibility/types.ts`)
   - Client-side types matching Convex implementation
   - Re-exported for use in application code

## Key Functions

### Computing Visibility

- `computeServerVisibility()` - Computes server-wide visibility settings
- `computeUserVisibility()` - Computes per-user visibility settings
- `getServerVisibilityContext()` - Fetches server visibility context from database
- `getAuthorVisibilityContexts()` - Fetches visibility contexts for multiple authors
- `isMessagePublic()` - Determines if a message should be public
- `shouldAnonymizeAuthor()` - Determines if an author should be anonymized

### Applying Visibility

- `applyVisibilityToAuthor()` - Sanitizes a single author based on visibility context
- `applyVisibilityToMessages()` - Sanitizes multiple messages with their authors
- `anonymizeAuthor()` - Generates an anonymous name for an author

## Visibility Rules

### Message Public Status

A message is considered public if:
1. Server has `considerAllMessagesPublicEnabled` set to `true`, OR
2. The message author has `canPubliclyDisplayMessages` set to `true` in their user server settings

### Author Anonymization

An author is anonymized if:
1. The message is not public (author visibility check failed), OR
2. The server has `anonymizeMessagesEnabled` set to `true` (even for public messages)

When anonymized:
- Author name is replaced with a deterministic anonymous name (e.g., "Anonymous User", "Mysterious User")
- Author avatar is set to `null`
- Author `public` flag is set to `false`

## Usage in Convex Functions

### Example: Applying Visibility to Messages

```typescript
import {
  applyVisibilityToMessages,
  getAuthorVisibilityContexts,
  getServerVisibilityContext,
} from "../shared/visibility";

// Get visibility contexts
const authorIds = Array.from(authorMap.keys());
const [serverVisibility, authorVisibilityMap] = await Promise.all([
  getServerVisibilityContext(ctx, serverId),
  getAuthorVisibilityContexts(ctx, serverId, authorIds),
]);

// Apply visibility
const sanitizedMessages = applyVisibilityToMessages(
  messages,
  serverVisibility,
  authorMap,
  authorVisibilityMap,
);
```

### Example: Single Author

```typescript
import {
  applyVisibilityToAuthor,
  getVisibilityContext,
  isMessagePublic,
} from "../shared/visibility";

const visibility = await getVisibilityContext(ctx, serverId, userId);
const isPublic = isMessagePublic(visibility.server, visibility.user);
const sanitizedAuthor = applyVisibilityToAuthor(author, visibility, isPublic);
```

## Sanitized Types

### SanitizedAuthor

```typescript
type SanitizedAuthor = VisibleAuthor | AnonymousAuthor;

type VisibleAuthor = {
  id: string;
  name: string;
  avatar: string | null;
  public: boolean;
};

type AnonymousAuthor = {
  id: string;
  name: string; // Deterministic anonymous name
  avatar: null;
  public: false;
};
```

### SanitizedMessage

```typescript
type SanitizedMessage = Message & {
  public: boolean;
};
```

## Integration Points

All message data leaving Convex is sanitized through these functions:

1. **`packages/database/convex/private/messages.ts`**
   - `getMessagePageData` - Applies visibility to message page data

2. **`packages/database/convex/public/search.ts`**
   - `publicSearch` - Applies visibility to search results
   - `getRecentThreads` - Applies visibility to recent threads

## Client-Side Usage

Types are exported from `@packages/database/src/visibility` for use in client-side code:

```typescript
import type { SanitizedAuthor, SanitizedMessage } from "@packages/database/src/visibility";
```

Client components should expect sanitized data with `public` flags and handle anonymized authors appropriately.

## Testing

Unit tests are located in `packages/database/src/visibility/visibility.test.ts` and cover:
- Server visibility computation
- User visibility computation
- Public message determination
- Anonymization logic
- Author name generation

Run tests with:
```bash
bun run test src/visibility/visibility.test.ts
```
