# Database Testing Infrastructure

This document describes the comprehensive testing infrastructure created for the `@packages/database` package.

## Overview

The testing infrastructure provides robust, composable unit tests without mocking. Tests use real database operations via Convex's test framework, ensuring accurate behavior verification.

## Test Statistics

- **28 unit tests** covering core database functionality
- **3 test modules**: servers, messages, and discord accounts
- **100% pass rate** on initial implementation
- **Fast execution**: ~2 seconds for full test suite

## Architecture

### 1. Convex Test Helpers (`convex/testHelpers/factories.ts`)

Test-only internal mutations for directly inserting data:

```typescript
// Examples:
testOnlyInsertServer({ server })
testOnlyInsertMessage({ message, attachments, reactions })
testOnlyInsertDiscordAccount({ account })
testOnlyClearAllData()
```

**Features:**
- Bypass business logic for fast test setup
- Support complex entities (messages with attachments/reactions)
- Bulk operations for efficient testing
- Cleanup utilities for test isolation

### 2. Data Builders (`src/test-helpers/builders.ts`)

Fluent API for creating test data with sensible defaults:

```typescript
const testServer = server()
  .withName("My Server")
  .withPlan("PRO")
  .withApproximateMemberCount(1000)
  .build();

const testMessage = message()
  .withServerId(serverId)
  .withChannelId(channelId)
  .withAuthorId(authorId)
  .withContent("Hello, world!")
  .build();
```

**Benefits:**
- Type-safe with full IntelliSense support
- Realistic test data with automatic ID generation
- Customizable via fluent interface
- Reusable across tests

### 3. Effect-Based Fixtures (`src/test-helpers/fixtures.ts`)

Composable test setup functions using Effect:

```typescript
// Simple fixtures
const { server, serverId } = yield* createTestServer();
const { channel, channelId } = yield* createTestChannel({ serverId });
const { account, accountId } = yield* createTestDiscordAccount();

// Composed fixtures
const { server, channel, author, messages } = 
  yield* createTestServerWithMessages(5);

const { thread, starterMessage, threadMessages } = 
  yield* createTestMessageThread(3);
```

**Advantages:**
- Composable via Effect.gen
- Automatic dependency management
- Clean error handling with Effect
- Reusable patterns for common scenarios

## Test Patterns

### Basic Test Structure

```typescript
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { Database } from "./database";
import { DatabaseTestLayer } from "./database-test";
import { createTestServer } from "./test-helpers";

describe("Feature Name", () => {
  it.scoped("test description", () =>
    Effect.gen(function* () {
      // Setup
      const { serverId } = yield* createTestServer({ name: "Test" });
      
      // Execute
      const database = yield* Database;
      const result = yield* database.private.servers.getServerByDiscordId({
        discordId: serverId,
      });
      
      // Assert
      expect(result).not.toBeNull();
      expect(result?.name).toBe("Test");
    }).pipe(Effect.provide(DatabaseTestLayer))
  );
});
```

### Testing Queries

```typescript
it.scoped("getServerByDiscordId returns existing server", () =>
  Effect.gen(function* () {
    const { serverId } = yield* createTestServer({ name: "My Server" });
    const database = yield* Database;
    
    const result = yield* database.private.servers.getServerByDiscordId({
      discordId: serverId,
    });
    
    expect(result).not.toBeNull();
    expect(result?.name).toBe("My Server");
  }).pipe(Effect.provide(DatabaseTestLayer))
);
```

### Testing Mutations

```typescript
it.scoped("upsertServer creates new server", () =>
  Effect.gen(function* () {
    const database = yield* Database;
    const testServerId = BigInt(12345);
    
    yield* database.private.servers.upsertServer({
      discordId: testServerId,
      name: "New Server",
      approximateMemberCount: 50,
      plan: "FREE",
    });
    
    const result = yield* database.private.servers.getServerByDiscordId({
      discordId: testServerId,
    });
    
    expect(result).not.toBeNull();
    expect(result?.name).toBe("New Server");
  }).pipe(Effect.provide(DatabaseTestLayer))
);
```

### Testing Complex Scenarios

```typescript
it.scoped("deleteDiscordAccount removes account and related data", () =>
  Effect.gen(function* () {
    const { serverId } = yield* createTestServer();
    const { channelId } = yield* createTestChannel({ serverId });
    const { accountId } = yield* createTestDiscordAccount();
    
    // Create a message from this account
    const { messageId } = yield* createTestMessage({
      serverId,
      channelId,
      authorId: accountId,
    });
    
    const database = yield* Database;
    
    // Verify account and message exist
    const beforeDelete = yield* database.private.discord_accounts
      .getDiscordAccountById({ id: accountId });
    expect(beforeDelete).not.toBeNull();
    
    // Delete the account
    yield* database.private.discord_accounts.deleteDiscordAccount({
      id: accountId,
    });
    
    // Verify cascade deletion
    const afterDelete = yield* database.private.discord_accounts
      .getDiscordAccountById({ id: accountId });
    expect(afterDelete).toBeNull();
    
    const afterDeleteMsg = yield* database.private.messages
      .getMessageById({ id: messageId });
    expect(afterDeleteMsg).toBeNull();
  }).pipe(Effect.provide(DatabaseTestLayer))
);
```

## Test Coverage

### Servers Module (`src/servers.test.ts`)
- ✅ Query: getServerByDiscordId (exists/not exists)
- ✅ Query: getAllServers
- ✅ Query: getBrowseServers (filtering kicked servers)
- ✅ Query: getBrowseServers (consenting users requirement)
- ✅ Query: getServerByDiscordIdWithChannels (indexed channels only)
- ✅ Query: getServerByDiscordIdWithChannels (filter threads)
- ✅ Mutation: upsertServer (create)
- ✅ Mutation: upsertServer (update)
- ✅ Mutation: findManyServersByDiscordId
- ✅ Mutation: findManyServersByDiscordId (empty array)

### Messages Module (`src/messages.test.ts`)
- ✅ Query: getMessageById (exists/not exists)
- ✅ Query: getTotalMessageCount
- ✅ Query: getMessagePageData
- ✅ Query: getTopQuestionSolversByServerId (ranking)
- ✅ Mutation: upsertMessage (create)
- ✅ Mutation: upsertMessage (update)
- ✅ Mutation: upsertMessage (with attachments)
- ✅ Mutation: deleteMessage
- ✅ Mutation: deleteManyMessages
- ✅ Mutation: upsertManyMessages

### Discord Accounts Module (`src/discord-accounts.test.ts`)
- ✅ Query: getDiscordAccountById (exists/not exists)
- ✅ Mutation: upsertDiscordAccount (create)
- ✅ Mutation: upsertDiscordAccount (update)
- ✅ Mutation: updateDiscordAccount
- ✅ Mutation: deleteDiscordAccount (cascade deletion)

## Key Features

### 1. No Mocking
Tests use real database operations, ensuring accurate behavior verification and catching integration issues early.

### 2. Composable Fixtures
Complex test scenarios are built by composing simple fixtures:

```typescript
const { server, channel, author, messages } = 
  yield* createTestServerWithMessages(5);
```

### 3. Type Safety
Full TypeScript support throughout, from builders to fixtures to test assertions.

### 4. Fast Execution
In-memory test database ensures tests run quickly (~2 seconds for 28 tests).

### 5. Isolated Tests
Each test gets a fresh database state via Convex's test framework.

### 6. Clean Assertions
Standard `expect()` assertions from @effect/vitest, familiar to most developers.

## Running Tests

```bash
# Run all tests
bun run test

# Run in watch mode
bun run test:watch

# Run specific test file
bun run test src/servers.test.ts
```

## Future Enhancements

Potential areas for expansion:

1. **Additional Coverage**
   - Channel queries and mutations
   - User server settings
   - Server preferences
   - Anonymous sessions

2. **Property-Based Testing**
   - Use fast-check for generating test data
   - Verify invariants across random inputs

3. **Performance Tests**
   - Bulk operations benchmarking
   - Query optimization verification

4. **Integration Tests**
   - Cross-module functionality
   - End-to-end scenarios

5. **Error Scenarios**
   - Invalid input handling
   - Constraint violations
   - Edge cases

## Best Practices

1. **Use `it.scoped()`** for all Effect-based tests
2. **Compose fixtures** to reduce boilerplate
3. **Keep tests focused** on single behaviors
4. **Use descriptive names** for test cases
5. **Verify state changes** explicitly
6. **Clean up after tests** (handled automatically)

## Dependencies

- **@effect/vitest**: Effect integration for vitest
- **@packages/convex-test**: Convex test utilities
- **@packages/test-utils**: Fast-check arbitraries and snowflake generation
- **fast-check**: Property-based testing library
- **vitest**: Test runner
- **effect**: Effect system for composable operations

## Fast-Check Integration

The test infrastructure leverages **fast-check** for property-based testing, generating realistic random test data:

### BigInt Snowflakes
```typescript
// Generates valid Discord snowflakes as BigInt directly
export const discordSnowflakeBigInt = fc
  .tuple(
    fc.bigInt({ min: DISCORD_EPOCH, max: BigInt(Date.now()) }),
    fc.bigInt({ min: 0n, max: 31n }), // workerId
    fc.bigInt({ min: 0n, max: 31n }), // processId
    fc.bigInt({ min: 0n, max: 4095n }), // increment
  )
  .map(([timestampMs, workerId, processId, increment]) => {
    const timestamp = timestampMs - DISCORD_EPOCH;
    return (timestamp << 22n) | (workerId << 17n) | (processId << 12n) | increment;
  });
```

### Domain-Specific Arbitraries
```typescript
// Available arbitraries in @packages/test-utils/arbitraries
- discordSnowflakeBigInt: Discord snowflake IDs
- serverName: Realistic server names
- discordUsername: Valid Discord usernames
- channelName: Channel names following Discord conventions
- messageContent: Varied message content
- serverPlan: Valid plan types
- channelType: Discord channel types
- permissions: Valid permission bitfields
- filename, fileSize, contentType: Attachment data
```

### Usage in Builders
```typescript
// Builders automatically use fast-check for realistic defaults
const server = server().build();
// Generated with:
// - Random valid snowflake ID
// - Realistic server name from fast-check
// - Random member count (1-100,000)
// - Random plan type
```

## Contributing

When adding new database functionality:

1. Add test-only factories in `convex/testHelpers/factories.ts`
2. Create builders in `src/test-helpers/builders.ts`
3. Add fixtures in `src/test-helpers/fixtures.ts`
4. Write tests following established patterns
5. Ensure all tests pass before submitting

## Resources

- [Test Helpers README](src/test-helpers/README.md) - Quick start guide
- [Effect Documentation](https://effect.website) - Effect system docs
- [Vitest Documentation](https://vitest.dev) - Test runner docs
- [Convex Testing](https://docs.convex.dev/testing) - Convex test framework

---

**Status**: ✅ Fully operational with 28 passing tests
**Last Updated**: November 25, 2024
