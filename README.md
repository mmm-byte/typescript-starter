# NestJS Events Feature — Feature Enhancement Assignment

This repository is a fork of the [nestjs/typescript-starter](https://github.com/nestjs/typescript-starter) that adds a new **Events** feature (per the assignment brief).

It demonstrates a small but realistic NestJS feature: two TypeORM entities (`Event`, `User`), a Many-to-Many relationship, DTO validation, unit tests with mocked repositories, and a true end-to-end test that boots a real SQLite database.

---

## What's in the box

| Layer | File(s) |
| --- | --- |
| App bootstrap | [src/main.ts](src/main.ts), [src/app.module.ts](src/app.module.ts) |
| Events feature | [src/events/event.entity.ts](src/events/event.entity.ts), [src/events/event-status.enum.ts](src/events/event-status.enum.ts), [src/events/dto/create-event.dto.ts](src/events/dto/create-event.dto.ts), [src/events/events.service.ts](src/events/events.service.ts), [src/events/events.controller.ts](src/events/events.controller.ts), [src/events/events.module.ts](src/events/events.module.ts) |
| Users feature | [src/users/user.entity.ts](src/users/user.entity.ts), [src/users/dto/create-user.dto.ts](src/users/dto/create-user.dto.ts), [src/users/users.service.ts](src/users/users.service.ts), [src/users/users.controller.ts](src/users/users.controller.ts), [src/users/users.module.ts](src/users/users.module.ts) |
| Unit tests (mocked) | [src/events/events.service.spec.ts](src/events/events.service.spec.ts), [src/events/events.controller.spec.ts](src/events/events.controller.spec.ts), [src/users/users.controller.spec.ts](src/users/users.controller.spec.ts) |
| E2E tests (real DB) | [test/events.e2e-spec.ts](test/events.e2e-spec.ts) |

### REST API

| Method | Path | Body / Params | Description |
| --- | --- | --- | --- |
| `POST` | `/users` | `{ "name": "Ada" }` | Create a user. |
| `GET`  | `/users` | – | List all users. |
| `GET`  | `/users/:id` | – | Fetch a user by id. |
| `POST` | `/users/:id/merge-events` | – | **MergeAll** for that user (see below). |
| `POST` | `/events` | [CreateEventDto](src/events/dto/create-event.dto.ts) | Create an event. |
| `GET`  | `/events` | – | List all events. |
| `GET`  | `/events/:id` | – | Fetch an event by id. |
| `DELETE` | `/events/:id` | – | Delete an event and update invitees' `events` lists. |

### Data model

`Event` — `id`, `title`, `description?`, `status` (`TODO` \| `IN_PROGRESS` \| `COMPLETED`), `startTime`, `endTime`, `createdAt`, `updatedAt`, `invitees: User[]`.

`User` — `id`, `name`, `events: string[]` (event IDs, per the assignment spec), `createdAt`, `updatedAt`, and an inverse `invitedEvents: Event[]` relation. The service keeps `events` in sync with the join table so that **mergeAll** can quickly find the events to merge for a given user.

### MergeAll

`POST /users/:id/merge-events` collapses every overlapping event the user is invited to into a single superset event. Per the assignment FAQ:

- **Mutates the database** (deletes the originals, inserts a merged row, and updates each invitee's `events` list) — not just a response.
- For overlapping scalars: `title` and `description` are appended with `" | "`. `status` picks a "reasonable" value via this priority: `IN_PROGRESS` > `COMPLETED` > `TODO` (i.e. the most-active / least-done state wins).
- **Invitees** of the merged event are the union of all invitees from the original events.

Example: `E1 = 10:00–11:00 (TODO)` and `E2 = 10:45–12:00 (IN_PROGRESS)` collapse to one event `10:00–12:00 (IN_PROGRESS)` titled `"E1.title | E2.title"`.

---

## How to run

```bash
# 1. Install
npm install

# 2. Start the API (creates a local SQLite file data.sqlite)
npm run start:dev

# Server listens on http://localhost:3000
# Override the DB path with: DB_PATH=/tmp/test.sqlite npm run start:dev
```

## How to test

Per the assignment FAQ #1 we do **both** — mocked unit tests and a real local DB e2e test.

```bash
# Unit tests (mocked TypeORM repositories)
npm test

# End-to-end tests (real SQLite, full Nest app + supertest)
npm run test:e2e

# Coverage report
npm run test:cov
```

You should see:

- `npm test` → **3 test suites / 13 tests passing**
- `npm run test:e2e` → **1 test suite / 3 tests passing**

---

## Try it with curl

```bash
# Create two users
curl -s -X POST http://localhost:3000/users -H 'Content-Type: application/json' \
  -d '{"name":"Ada"}' | tee /tmp/ada.json
curl -s -X POST http://localhost:3000/users -H 'Content-Type: application/json' \
  -d '{"name":"Bea"}' | tee /tmp/bea.json

ADA_ID=$(jq -r .id /tmp/ada.json)
BEA_ID=$(jq -r .id /tmp/bea.json)

# Create two overlapping events
curl -s -X POST http://localhost:3000/events -H 'Content-Type: application/json' -d "{
  \"title\": \"Standup\",
  \"status\": \"TODO\",
  \"startTime\": \"2026-01-01T10:00:00Z\",
  \"endTime\":   \"2026-01-01T11:00:00Z\",
  \"invitees\":  [\"$ADA_ID\"]
}"

curl -s -X POST http://localhost:3000/events -H 'Content-Type: application/json' -d "{
  \"title\": \"1:1\",
  \"status\": \"IN_PROGRESS\",
  \"startTime\": \"2026-01-01T10:45:00Z\",
  \"endTime\":   \"2026-01-01T12:00:00Z\",
  \"invitees\":  [\"$ADA_ID\", \"$BEA_ID\"]
}"

# Merge Ada's overlapping events
curl -s -X POST "http://localhost:3000/users/$ADA_ID/merge-events" | jq .

# Fetch an event by id
curl -s "http://localhost:3000/events/<event-id>" | jq .

# Delete an event
curl -s -X DELETE "http://localhost:3000/events/<event-id>" -o /dev/null -w "%{http_code}\n"
```

---

## Stack & decisions

- **NestJS 11** with `@nestjs/typeorm`, `class-validator`, `class-transformer`.
- **better-sqlite3** as the database driver. Zero setup, real SQL, real FK constraints. Swap to Postgres by editing `src/app.module.ts` (e.g. `type: 'postgres'`) — no service-level changes required.
- **TypeORM `synchronize: true`** is enabled for the demo. For production, switch to migrations.
- DTO validation is enabled globally via `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- Tests follow the [NestJS testing guide](https://docs.nestjs.com/fundamentals/testing): unit tests use `Test.createTestingModule` with mock repositories; e2e tests use `Test.createTestingModule` against a real SQLite database file (deleted per-run).

---

## Project structure (post-changes)

```
.
├── README.md
├── eslint.config.mjs
├── nest-cli.json
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── src
    ├── main.ts
    ├── app.module.ts
    ├── events
    │   ├── event-status.enum.ts
    │   ├── event.entity.ts
    │   ├── events.controller.ts
    │   ├── events.controller.spec.ts
    │   ├── events.module.ts
    │   ├── events.service.ts
    │   ├── events.service.spec.ts
    │   └── dto
    │       └── create-event.dto.ts
    └── users
        ├── user.entity.ts
        ├── users.controller.ts
        ├── users.controller.spec.ts
        ├── users.module.ts
        ├── users.service.ts
        └── dto
            └── create-user.dto.ts
└── test
    ├── events.e2e-spec.ts
    └── jest-e2e.json
```

---

## Demo video script

The assignment asks for a short video demonstrating the 3 task APIs and the unit tests working. Suggested 60-second script:

1. `npm install` (skip if recording on the already-installed state)
2. `npm test` — show the 13 passing unit tests in the terminal.
3. `npm run start:dev` in a second terminal — server is up.
4. `curl` the create-user / create-event / fetch-event / merge-events / delete-event calls in order (copy-paste from the curl block above).
5. `npm run test:e2e` — show the 3 passing e2e tests.
