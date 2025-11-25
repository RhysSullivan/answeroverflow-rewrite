# Database Test Helpers

This directory contains test helpers for writing robust unit tests for the database package.

## Architecture

The testing infrastructure consists of three main components:

1. **Convex Test Helpers** (`convex/testHelpers/factories.ts`)
   - Internal mutations for directly inserting test data
   - Bypass business logic for fast test setup
   - Cleanup utilities for test isolation

2. **Data Builders** (`builders.ts`)
   - Fluent API for creating test data
   - Type-safe and easy to customize
   - Generates realistic test data with defaults

3. **Effect Fixtures** (`fixtures.ts`)
   - Composable Effect-based test setup functions
   - Higher-level abstractions for common test scenarios
   - Clean, reusable test patterns

## Quick Start

### Basic Test Pattern

```typescript
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { Database } from "./database";
import { DatabaseTestLayer } from "./database-test";
import { createTestServer } from "./test-helpers";

describe("My Feature", () => {
  it.scoped("my test case", () =>
    Effect.gen(function* () {
      // Setup: Create test data
      const { serverId } = yield* createTestServer({ name: "Test Server" });
      
      // Execute: Call the function under test
      const database = yield* Database;
      const result = yield* database.private.servers.getServerByDiscordId({
        discordId: serverId,
      });
      
      // Assert: Verify the results
      expect(result).not.toBeNull();
      expect(result?.name).toBe("Test Server");
    }).pipe(Effect.provide(DatabaseTestLayer))
  );
});
```

### Using Data Builders

```typescript
import { server, channel, message } from "./test-helpers";

// Create test data with builders
const testServer = server()
  .withName("My Server")
  .withPlan("PRO")
  .withApproximateMemberCount(1000)
  .build();

const testChannel = channel()
  .withServerId(testServer.discordId)
  .withName("general")
  .withType(0)
  .build();
```

### Composable Fixtures

```typescript
import {
  createTestServerWithMessages,
  createTestMessageThread,
  createTestBrowsableServer,
} from "./test-helpers";

// Create a complete test scenario
const { server, channel, author, messages } = yield* createTestServerWithMessages(5);

// Create a message thread
const { thread, starterMessage, threadMessages } = yield* createTestMessageThread(3);

// Create a browsable server
const { server, users } = yield* createTestBrowsableServer(15);
```

## Key Principles

1. **No Mocking** - Use real database operations for accurate testing
2. **Composable** - Combine fixtures to build complex test scenarios
3. **Type-Safe** - Full TypeScript support throughout
4. **Isolated** - Each test gets a fresh database state
5. **Fast** - In-memory test database for quick execution
6. **Readable** - Minimal setup code, clear assertions

## Available Fixtures

- `createTestServer()` - Create a server
- `createTestServerPreferences()` - Create server preferences
- `createTestDiscordAccount()` - Create a Discord account
- `createTestChannel()` - Create a channel
- `createTestChannelSettings()` - Create channel settings
- `createTestMessage()` - Create a message
- `createTestUserServerSettings()` - Create user server settings
- `createTestServerWithChannel()` - Server + channel + settings
- `createTestServerWithMessages()` - Complete message setup
- `createTestBrowsableServer()` - Server with consenting users
- `createTestMessageThread()` - Thread with messages
- `cleanupTestData()` - Clean up all test data

## Tips

- Use `it.scoped()` for all tests that use Effect
- End Effect chains with `.pipe(Effect.provide(DatabaseTestLayer))`
- Use `yield*` to extract services and run effects
- Use standard `expect()` assertions from @effect/vitest
- Compose fixtures to reduce boilerplate
- Keep tests focused on a single behavior

## Example Test Files

See the following test files for examples:
- `src/servers.test.ts` - Server query and mutation tests
- `src/messages.test.ts` - Message handling tests
- `src/discord-accounts.test.ts` - Account management tests
