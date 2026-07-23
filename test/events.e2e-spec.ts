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
 * End-to-end test that boots the full Nest app against a real
 * SQLite database file (per assignment FAQ #1: do "both" — mocked
 * unit tests + a real DB path).
 *
 * Stability notes:
 *   - We pick a free high port up front and pass it to `app.listen(port)`
 *     so back-to-back jest runs do not race the kernel's port-recycle window.
 *   - We close the app fully in afterAll and wait for the close callback
 *     to resolve before the jest worker exits.
 */
describe('Events REST API (e2e, real SQLite DB)', () => {
  let app: INestApplication<App>;
  const testDbPath = `test/e2e-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.sqlite`;

  /** Ask the OS for a free TCP port in the high range. */
  function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.unref();
      probe.on('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const addr = probe.address();
        const port =
          typeof addr === 'object' && addr ? addr.port : 0;
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
    // Close the Nest app (which closes the http server + DB connections),
    // then give the OS a moment to fully release the port.
    try {
      await app.close();
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 100));
    // Best-effort cleanup of the temp DB file.
    try {
      const fs = await import('node:fs/promises');
      await fs.unlink(testDbPath);
    } catch {
      /* ignore */
    }
  });

  it('rejects malformed event payloads (400)', async () => {
    await request(app.getHttpServer())
      .post('/events')
      .send({ title: '' })
      .expect(400);
  });

  it('supports full CRUD + merge flow for a user', async () => {
    // 1) Create two users.
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

    // 2) Create two overlapping events both inviting Ada (and Bea on E2).
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

    // 3) Retrieve an event by id (GET /events/:id).
    const fetched = await request(app.getHttpServer())
      .get(`/events/${e1Id}`)
      .expect(200);
    expect(fetched.body.id).toBe(e1Id);
    expect(fetched.body.title).toBe('Standup');

    // 4) Merge for Ada — the two overlapping events collapse into one.
    const merged = await request(app.getHttpServer())
      .post(`/users/${adaId}/merge-events`)
      .expect(200);
    expect(merged.body).toHaveLength(1);
    const m = merged.body[0];
    expect(m.startTime).toBe('2026-01-01T10:00:00.000Z');
    expect(m.endTime).toBe('2026-01-01T12:00:00.000Z');
    expect(m.title).toContain('Standup');
    expect(m.title).toContain('1:1');
    expect(m.status).toBe('IN_PROGRESS');

    // The originals are gone.
    await request(app.getHttpServer()).get(`/events/${e1Id}`).expect(404);
    await request(app.getHttpServer()).get(`/events/${e2Id}`).expect(404);

    // Ada now points at the merged event id; Bea still points at e2.
    const adaAfter = await request(app.getHttpServer())
      .get(`/users/${adaId}`)
      .expect(200);
    expect(adaAfter.body.events).toEqual([m.id]);

    // 5) Delete the merged event.
    await request(app.getHttpServer())
      .delete(`/events/${m.id}`)
      .expect(204);
    await request(app.getHttpServer()).get(`/events/${m.id}`).expect(404);
  });

  it('returns 404 for an unknown event', async () => {
    await request(app.getHttpServer())
      .get('/events/00000000-0000-4000-8000-000000000000')
      .expect(404);
  });
});
