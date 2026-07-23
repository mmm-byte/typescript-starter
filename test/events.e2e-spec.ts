import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as net from 'node:net';
import request from 'supertest';
import { App } from 'supertest/types';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from '../src/events/event.entity';
import { User } from '../src/users/user.entity';
import { EventsModule } from '../src/events/events.module';
import { UsersModule } from '../src/users/users.module';

/**
 * End-to-end tests that boot the full Nest app against a real
 * SQLite database file (per assignment FAQ #1: do "both" — mocked
 * unit tests + a real DB path).
 *
 * Stability notes:
 *   - A free OS port is claimed before each suite so parallel jest
 *     workers never collide.
 *   - The temp DB file is deleted in afterAll.
 */
describe('Events REST API (e2e, real SQLite DB)', () => {
  let app: INestApplication<App>;
  const testDbPath = `test/e2e-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.sqlite`;

  function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.unref();
      probe.on('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const addr = probe.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        probe.close(() => resolve(port));
      });
    });
  }

  beforeAll(async () => {
    const port = await getFreePort();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: testDbPath,
          entities: [Event, User],
          synchronize: true,
        }),
        EventsModule,
        UsersModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    await app.listen(port, '127.0.0.1');
  });

  afterAll(async () => {
    try {
      await app.close();
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 100));
    try {
      const fs = await import('node:fs/promises');
      await fs.unlink(testDbPath);
    } catch {
      /* ignore */
    }
  });

  // ── Test 1: validation ───────────────────────────────────────────────────

  it('rejects malformed event payloads (400)', async () => {
    await request(app.getHttpServer())
      .post('/events')
      .send({ title: '' })
      .expect(400);
  });

  // ── Test 2: full CRUD + merge via EventsController ───────────────────────

  it('supports full CRUD + merge via POST /events/merge/:userId', async () => {
    // Create two users.
    const ada = await request(app.getHttpServer())
      .post('/users')
      .send({ name: 'Ada' })
      .expect(201);
    const bea = await request(app.getHttpServer())
      .post('/users')
      .send({ name: 'Bea' })
      .expect(201);
    const adaId = ada.body.id as string;
    const beaId = bea.body.id as string;

    // Create two overlapping events.
    const e1 = await request(app.getHttpServer())
      .post('/events')
      .send({
        title: 'Standup',
        description: 'morning sync',
        status: 'TODO',
        startTime: '2026-01-01T10:00:00Z',
        endTime: '2026-01-01T11:00:00Z',
        invitees: [adaId],
      })
      .expect(201);
    const e1Id = e1.body.id as string;

    const e2 = await request(app.getHttpServer())
      .post('/events')
      .send({
        title: '1:1',
        description: 'pairing',
        status: 'IN_PROGRESS',
        startTime: '2026-01-01T10:45:00Z',
        endTime: '2026-01-01T12:00:00Z',
        invitees: [adaId, beaId],
      })
      .expect(201);
    const e2Id = e2.body.id as string;

    // GET /events/:id
    const fetched = await request(app.getHttpServer())
      .get(`/events/${e1Id}`)
      .expect(200);
    expect(fetched.body.title).toBe('Standup');

    // GET /events?userId=adaId — should return both of Ada's events.
    const adaEvents = await request(app.getHttpServer())
      .get(`/events?userId=${adaId}`)
      .expect(200);
    expect(adaEvents.body.map((e: { id: string }) => e.id)).toEqual(
      expect.arrayContaining([e1Id, e2Id]),
    );

    // POST /events/merge/:userId — EventsController route.
    const merged = await request(app.getHttpServer())
      .post(`/events/merge/${adaId}`)
      .expect(200);
    expect(merged.body).toHaveLength(1);
    const m = merged.body[0];
    expect(m.startTime).toBe('2026-01-01T10:00:00.000Z');
    expect(m.endTime).toBe('2026-01-01T12:00:00.000Z');
    expect(m.title).toContain('Standup');
    expect(m.title).toContain('1:1');
    expect(m.status).toBe('IN_PROGRESS'); // IN_PROGRESS beats TODO

    // Originals are gone.
    await request(app.getHttpServer()).get(`/events/${e1Id}`).expect(404);
    await request(app.getHttpServer()).get(`/events/${e2Id}`).expect(404);

    // Ada's events list now points only at the merged event.
    const adaAfter = await request(app.getHttpServer())
      .get(`/users/${adaId}`)
      .expect(200);
    expect(adaAfter.body.events).toEqual([m.id]);

    // DELETE /events/:id
    await request(app.getHttpServer()).delete(`/events/${m.id}`).expect(204);
    await request(app.getHttpServer()).get(`/events/${m.id}`).expect(404);
  });

  // ── Test 3: merge via UsersController ────────────────────────────────────

  it('POST /users/:id/merge-events also merges correctly (UsersController route)', async () => {
    const cy = await request(app.getHttpServer())
      .post('/users')
      .send({ name: 'Cy' })
      .expect(201);
    const cyId = cy.body.id as string;

    await request(app.getHttpServer())
      .post('/events')
      .send({
        title: 'Alpha',
        status: 'TODO',
        startTime: '2026-03-01T09:00:00Z',
        endTime: '2026-03-01T10:00:00Z',
        invitees: [cyId],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/events')
      .send({
        title: 'Beta',
        status: 'COMPLETED',
        startTime: '2026-03-01T09:30:00Z',
        endTime: '2026-03-01T11:00:00Z',
        invitees: [cyId],
      })
      .expect(201);

    const merged = await request(app.getHttpServer())
      .post(`/users/${cyId}/merge-events`)
      .expect(200);
    expect(merged.body).toHaveLength(1);
    expect(merged.body[0].title).toContain('Alpha');
    expect(merged.body[0].title).toContain('Beta');
    expect(merged.body[0].status).toBe('COMPLETED'); // COMPLETED wins when no IN_PROGRESS
  });

  // ── Test 4: 404 for unknown event ────────────────────────────────────────

  it('returns 404 for an unknown event id', async () => {
    await request(app.getHttpServer())
      .get('/events/00000000-0000-4000-8000-000000000000')
      .expect(404);
  });
});
