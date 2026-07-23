import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { Event } from './event.entity';
import { User } from '../users/user.entity';
import { EventStatus } from './event-status.enum';
import { CreateEventDto } from './dto/create-event.dto';

/* ------------------------------------------------------------------ */
/* Test doubles                                                        */
/* ------------------------------------------------------------------ */

type EventRow = Event & { id: string };
type UserRow = User & { id: string; events: string[] };

function makeEventRepo() {
  const rows = new Map<string, EventRow>();
  return {
    rows,
    create: jest.fn((data: Partial<Event>): EventRow => {
      return { ...(data as EventRow) };
    }),
    save: jest.fn(async (entity: EventRow): Promise<EventRow> => {
      if (!entity.id) {
        entity.id = `ev-${rows.size + 1}-${Date.now()}`;
      }
      rows.set(entity.id, entity);
      return entity;
    }),
    findOne: jest.fn(async (opts: { where: { id: string }; relations?: unknown }) => {
      const found = rows.get(opts.where.id);
      if (!found) return null;
      return { ...found };
    }),
    find: jest.fn(async () => Array.from(rows.values())),
    delete: jest.fn(async (criteria: string[] | { id: string }[]) => {
      for (const c of criteria) {
        const id = typeof c === 'string' ? c : c.id;
        rows.delete(id);
      }
      return { affected: (criteria as unknown[]).length };
    }),
    remove: jest.fn(async (entity: EventRow) => {
      rows.delete(entity.id);
      return entity;
    }),
  };
}

function makeUserRepo() {
  const rows = new Map<string, UserRow>();
  return {
    rows,
    create: jest.fn((data: Partial<User>): UserRow => {
      return { ...(data as UserRow) } as UserRow;
    }),
    save: jest.fn(async (entity: UserRow): Promise<UserRow> => {
      if (!entity.id) {
        entity.id = `u-${rows.size + 1}-${Date.now()}`;
      }
      rows.set(entity.id, entity);
      return entity;
    }),
    findOne: jest.fn(async (opts: { where: { id: string } }) => {
      const found = rows.get(opts.where.id);
      return found ? { ...found } : null;
    }),
    find: jest.fn(async (opts: { where: { id: { _value: string[] } } } = { where: { id: { _value: [] } } }) => {
      const ids: string[] = (opts.where?.id as unknown as { _value: string[] })?._value ?? [];
      if (ids.length === 0) return [];
      return Array.from(rows.values()).filter((u) => ids.includes(u.id));
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe('EventsService', () => {
  let service: EventsService;
  let eventRepo: ReturnType<typeof makeEventRepo>;
  let userRepo: ReturnType<typeof makeUserRepo>;

  beforeEach(async () => {
    eventRepo = makeEventRepo();
    userRepo = makeUserRepo();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(Event), useValue: eventRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = moduleRef.get(EventsService);
  });

  describe('create', () => {
    it('rejects an endTime <= startTime', async () => {
      const dto: CreateEventDto = {
        title: 'Bad',
        startTime: new Date('2026-01-01T10:00:00Z'),
        endTime: new Date('2026-01-01T10:00:00Z'),
      } as unknown as CreateEventDto;

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFound when an invitee id does not exist', async () => {
      const dto: CreateEventDto = {
        title: 'Demo',
        startTime: new Date('2026-01-01T10:00:00Z'),
        endTime: new Date('2026-01-01T11:00:00Z'),
        invitees: ['ghost-id'],
      } as unknown as CreateEventDto;

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('persists the event and appends the new id to every invitee', async () => {
      const user: UserRow = {
        id: 'u-1',
        name: 'Ada',
        events: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as UserRow;
      userRepo.rows.set(user.id, user);

      const dto: CreateEventDto = {
        title: 'Sync',
        startTime: new Date('2026-01-01T10:00:00Z'),
        endTime: new Date('2026-01-01T11:00:00Z'),
        invitees: [user.id],
      } as unknown as CreateEventDto;

      const result = await service.create(dto);
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(userRepo.rows.get(user.id)!.events).toEqual([result.id]);
    });
  });

  describe('findById / deleteById', () => {
    it('throws NotFound when the event does not exist', async () => {
      await expect(service.findById('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('deletes the event and removes the id from invitees', async () => {
      const user: UserRow = {
        id: 'u-1',
        name: 'Ada',
        events: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as UserRow;
      userRepo.rows.set(user.id, user);

      const ev: EventRow = {
        id: 'e-1',
        title: 'X',
        status: EventStatus.TODO,
        startTime: new Date('2026-01-01T10:00:00Z'),
        endTime: new Date('2026-01-01T11:00:00Z'),
        invitees: [user],
      } as EventRow;
      eventRepo.rows.set(ev.id, ev);
      user.events = [ev.id];

      await service.deleteById(ev.id);
      expect(eventRepo.rows.has(ev.id)).toBe(false);
      expect(userRepo.rows.get(user.id)!.events).toEqual([]);
    });
  });

  describe('mergeAllForUser', () => {
    async function seedUserWithTwoOverlappingEvents() {
      const user: UserRow = {
        id: 'u-1',
        name: 'Ada',
        events: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as UserRow;
      userRepo.rows.set(user.id, user);

      const e1: EventRow = {
        id: 'e-1',
        title: 'Standup',
        status: EventStatus.TODO,
        startTime: new Date('2026-01-01T10:00:00Z'),
        endTime: new Date('2026-01-01T11:00:00Z'),
        invitees: [user],
      } as EventRow;
      const e2: EventRow = {
        id: 'e-2',
        title: '1:1',
        status: EventStatus.IN_PROGRESS,
        startTime: new Date('2026-01-01T10:45:00Z'),
        endTime: new Date('2026-01-01T12:00:00Z'),
        invitees: [user],
      } as EventRow;
      eventRepo.rows.set(e1.id, e1);
      eventRepo.rows.set(e2.id, e2);
      user.events = [e1.id, e2.id];
      return { user, e1, e2 };
    }

    it('merges two overlapping events into one spanning the full range', async () => {
      const { user, e1, e2 } = await seedUserWithTwoOverlappingEvents();

      const merged = await service.mergeAllForUser(user.id);

      expect(merged).toHaveLength(1);
      const m = merged[0];
      expect(m.startTime.toISOString()).toBe(e1.startTime.toISOString());
      expect(m.endTime.toISOString()).toBe(e2.endTime.toISOString());
      expect(m.title).toContain('Standup');
      expect(m.title).toContain('1:1');
      expect(m.status).toBe(EventStatus.IN_PROGRESS); // most-active wins

      // Both originals are gone.
      expect(eventRepo.rows.has(e1.id)).toBe(false);
      expect(eventRepo.rows.has(e2.id)).toBe(false);

      // The user's `events` list now points to the new merged id.
      const refreshedUser = userRepo.rows.get(user.id)!;
      expect(refreshedUser.events).toHaveLength(1);
      expect(refreshedUser.events[0]).toBe(m.id);
    });

    it('leaves a non-overlapping event untouched', async () => {
      const user: UserRow = {
        id: 'u-2',
        name: 'Bea',
        events: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as UserRow;
      userRepo.rows.set(user.id, user);

      const e1: EventRow = {
        id: 'e-A',
        title: 'Morning',
        status: EventStatus.TODO,
        startTime: new Date('2026-01-01T08:00:00Z'),
        endTime: new Date('2026-01-01T09:00:00Z'),
        invitees: [user],
      } as EventRow;
      const e2: EventRow = {
        id: 'e-B',
        title: 'Afternoon',
        status: EventStatus.TODO,
        startTime: new Date('2026-01-01T14:00:00Z'),
        endTime: new Date('2026-01-01T15:00:00Z'),
        invitees: [user],
      } as EventRow;
      eventRepo.rows.set(e1.id, e1);
      eventRepo.rows.set(e2.id, e2);
      user.events = [e1.id, e2.id];

      const merged = await service.mergeAllForUser(user.id);
      expect(merged).toHaveLength(2);
      expect(eventRepo.rows.has(e1.id)).toBe(true);
      expect(eventRepo.rows.has(e2.id)).toBe(true);
    });

    it('returns [] when the user has no events', async () => {
      const user: UserRow = {
        id: 'u-3',
        name: 'Cy',
        events: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as UserRow;
      userRepo.rows.set(user.id, user);

      const merged = await service.mergeAllForUser(user.id);
      expect(merged).toEqual([]);
    });
  });
});
