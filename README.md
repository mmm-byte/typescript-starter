# NestJS Events Feature — Feature Enhancement Assignment

This repository is a fork of the [nestjs/typescript-starter](https://github.com/nestjs/typescript-starter) that adds a full **Events** feature (per the assignment brief).

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

---

## REST API

| Method | Path | Body / Params | Description |
| --- | --- | --- | --- |
| `POST` | `/users` | `{ "name": "Ada" }` | Create a user. |
| `GET`  | `/users` | – | List all users. |
| `GET`  | `/users/:id` | – | Fetch a user by id. |
| `POST` | `/users/:id/merge-events` | – | **MergeAll** for that user (UsersController). |
| `POST` | `/events` | [CreateEventDto](src/events/dto/create-event.dto.ts) | Create an event. |
| `GET`  | `/events` | – | List all events. |
| `GET`  | `/events?userId=:id` | – | List only events that user is invited to. |
| `GET`  | `/events/:id` | – | Fetch an event by id. |
| `DELETE` | `/events/:id` | – | Delete an event and update invitees' `events` lists. |
| `POST` | `/events/merge/:userId` | – | **MergeAll** for that user (EventsController). |

> **MergeAll is exposed on both routers** — `POST /users/:id/merge-events` and
> `POST /events/merge/:userId` both call the same service method.

---

## Data model

**`Event`** — `id` (UUID), `title` (string, required), `description` (string, optional),
`status` (`TODO` \| `IN_PROGRESS` \| `COMPLETED`), `startTime`, `endTime`,
`createdAt`, `updatedAt`, `invitees: User[]`.

> **Note on `status` column type:** stored as `varchar(32)` rather than a native
> SQL ENUM so the same schema runs on SQLite (no native ENUM), MySQL, and
> PostgreSQL without driver changes. Values are still fully constrained at the
> application layer via class-validator's `@IsEnum` on `CreateEventDto`.

**`User`** — `id` (UUID), `name`, `events: string[]` (event IDs, per the assignment
spec), `createdAt`, `updatedAt`, and an inverse `invitedEvents: Event[]` relation.
The service keeps `events` in sync with the join table so that **MergeAll** can
quickly find the events to merge for a given user.

---

## MergeAll

`POST /events/merge/:userId` (or `POST /users/:id/merge-events`) collapses every
overlapping event the user is invited to into a single superset event.

Per the assignment FAQ:

- **Mutates the database** — deletes the originals, inserts a merged row, and
  updates each invitee's `events` list. It is not just a response.
- **Scalars**: `title` and `description` are appended with `" | "`.
- **Status heuristic**: `IN_PROGRESS` > `COMPLETED` > `TODO` (most-active state wins).
- **Invitees** of the merged event are the union of all invitees from the original
  events.

Example: `E1 = 10:00–11:00 (TODO)` and `E2 = 10:45–12:00 (IN_PROGRESS)` collapse
to `E_merged = 10:00–12:00 (IN_PROGRESS)` titled `"Standup | 1:1"`.

---

## How to run

```bash
# 1. Install dependencies
npm install

# 2. Start the API  (SQLite file auto-created at ./data.sqlite)
npm run start:dev

# Server listens on http://localhost:3000
# Override the DB path:  DB_PATH=/tmp/myapp.sqlite npm run start:dev
# Override the port:     PORT=4000 npm run start:dev
```

### Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `DB_PATH` | `data.sqlite` | Path to the SQLite database file |
| `PORT` | `3000` | HTTP port the server listens on |

> **Swapping to PostgreSQL or MySQL:** edit `src/app.module.ts` — change
> `type: 'better-sqlite3'` to `type: 'postgres'` (or `'mysql'`) and supply
> the usual connection keys. No service or entity changes are required.

---

## How to test

Per assignment FAQ #1 we do **both** — mocked unit tests and a real local-DB e2e test.

```bash
# Unit tests  (mocked TypeORM repositories — no database needed)
npm test

# End-to-end tests  (real SQLite DB, full Nest app + supertest HTTP calls)
npm run test:e2e

# Coverage report
npm run test:cov
```

Expected results:

| Command | Suites | Tests |
| --- | --- | --- |
| `npm test` | 3 | 16 |
| `npm run test:e2e` | 1 | 4 |

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

# List only Ada's events
curl -s "http://localhost:3000/events?userId=$ADA_ID" | jq .

# Merge via EventsController route
curl -s -X POST "http://localhost:3000/events/merge/$ADA_ID" | jq .

# — or via UsersController route —
curl -s -X POST "http://localhost:3000/users/$ADA_ID/merge-events" | jq .

# Fetch an event by id
curl -s "http://localhost:3000/events/<event-id>" | jq .

# Delete an event
curl -s -X DELETE "http://localhost:3000/events/<event-id>" -o /dev/null -w "%{http_code}\n"
```

---

## Stack & decisions

- **NestJS 11** with `@nestjs/typeorm`, `class-validator`, `class-transformer`.
- **better-sqlite3** as the database driver. Zero setup, real SQL, real FK constraints.
  Swap to Postgres/MySQL by editing `src/app.module.ts` — no service-level changes required.
- **TypeORM `synchronize: true`** is enabled for the demo. For production, use TypeORM migrations.
- **DTO validation** is enabled globally via `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- **Status column** is `varchar(32)` (not native ENUM) so the same schema runs on SQLite,
  MySQL, and PostgreSQL without migration changes. Values are still constrained at the app layer.
- **Tests** follow the [NestJS testing guide](https://docs.nestjs.com/fundamentals/testing):
  unit tests use `Test.createTestingModule` with mock repositories; e2e tests use
  `Test.createTestingModule` against a real SQLite file (deleted after each run).

---

## Project structure

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
    │   ├── events.controller.ts        ← POST/GET/DELETE + POST merge/:userId
    │   ├── events.controller.spec.ts   ← 6 unit tests
    │   ├── events.module.ts
    │   ├── events.service.ts           ← create / findById / findAll / findAllForUser / deleteById / mergeAllForUser
    │   ├── events.service.spec.ts      ← 7 unit tests
    │   └── dto
    │       └── create-event.dto.ts
    └── users
        ├── user.entity.ts
        ├── users.controller.ts         ← POST /users/:id/merge-events
        ├── users.controller.spec.ts    ← 3 unit tests
        ├── users.module.ts
        ├── users.service.ts
        └── dto
            └── create-user.dto.ts
└── test
    ├── events.e2e-spec.ts              ← 4 e2e tests (real SQLite)
    └── jest-e2e.json
```

---

## Demo video script

Suggested 90-second script:

1. `npm install` (skip if already installed).
2. `npm test` — show the **16 passing unit tests** across 3 suites.
3. `npm run start:dev` in a second terminal — server starts on port 3000.
4. Run the `curl` block above in order: create users → create events → list user events → merge → fetch → delete.
5. `npm run test:e2e` — show the **4 passing e2e tests**.
