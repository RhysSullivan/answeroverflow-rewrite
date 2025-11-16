# Visibility Flags & Access Points Inventory

## Visibility Flags

### Server Preferences (`serverPreferences` table)
- `considerAllMessagesPublicEnabled` (optional boolean) - Server-wide setting to make all messages public
- `anonymizeMessagesEnabled` (optional boolean) - Server-wide setting to anonymize messages

### User Server Settings (`userServerSettings` table)
- `canPubliclyDisplayMessages` (boolean) - Per-user consent to publicly display their messages

## Message Data Access Points

### Convex Functions Returning Message Data

1. **`packages/database/convex/private/messages.ts`**
   - `getMessagePageData` - Returns full message data with author, attachments, reactions, solutions, metadata
   - Currently returns raw author data without visibility checks

2. **`packages/database/convex/public/search.ts`**
   - `publicSearch` - Returns paginated search results with messages, authors, attachments, reactions, solutions, metadata
   - Currently returns raw author data without visibility checks
   - `getRecentThreads` - Returns recent threads with messages, authors, attachments, reactions
   - Currently returns raw author data without visibility checks

### Client-Side Consumers

1. **`apps/main-site/src/app/m/[messageId]/page.tsx`**
   - Uses `getMessagePageData` to display message pages

2. **`apps/main-site/src/app/search/page.tsx`**
   - Uses `publicSearch` to display search results

3. **`apps/main-site/src/app/client.tsx`**
   - Uses `getRecentThreads` to display recent threads

## Current State

- No centralized visibility logic
- Author data returned without sanitization
- No anonymization applied
- No public flag checks applied
- Visibility logic needs to be added at each access point
