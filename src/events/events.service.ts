import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Event } from './event.entity';
import { EventStatus } from './event-status.enum';
import { CreateEventDto } from './dto/create-event.dto';
import { User } from '../users/user.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /** Create a new event and update the invitees' `events` lists. */
  async create(createEventDto: CreateEventDto): Promise<Event> {
    this.assertTimeRange(createEventDto.startTime, createEventDto.endTime);

    const inviteeIds = createEventDto.invitees ?? [];
    let invitees: User[] = [];
    if (inviteeIds.length > 0) {
      invitees = await this.usersRepository.find({
        where: { id: In(inviteeIds) },
      });
      if (invitees.length !== inviteeIds.length) {
        const found = new Set(invitees.map((u) => u.id));
        const missing = inviteeIds.filter((id) => !found.has(id));
        throw new NotFoundException(
          `Invitee user(s) not found: ${missing.join(', ')}`,
        );
      }
    }

    const event = this.eventsRepository.create({
      title: createEventDto.title,
      description: createEventDto.description ?? null,
      status: createEventDto.status ?? EventStatus.TODO,
      startTime: createEventDto.startTime,
      endTime: createEventDto.endTime,
      invitees,
    });

    const saved = await this.eventsRepository.save(event);

    // Mirror relation onto User.events (string[] of event IDs) per spec.
    if (invitees.length > 0) {
      await this.appendEventToUsers(invitees, saved.id);
    }

    return this.findById(saved.id);
  }

  async findById(id: string): Promise<Event> {
    if (!id) {
      throw new BadRequestException('Event id is required');
    }
    const event = await this.eventsRepository.findOne({
      where: { id },
      relations: { invitees: true },
    });
    if (!event) {
      throw new NotFoundException(`Event with id "${id}" not found`);
    }
    return event;
  }

  async findAll(): Promise<Event[]> {
    return this.eventsRepository.find({
      relations: { invitees: true },
      order: { startTime: 'ASC' },
    });
  }

  /**
   * Return only the events that a specific user is invited to.
   * Used by GET /events?userId=:id.
   */
  async findAllForUser(userId: string): Promise<Event[]> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }
    const eventIds = (user.events ?? []).filter(Boolean);
    if (eventIds.length === 0) {
      return [];
    }
    return this.eventsRepository.find({
      where: { id: In(eventIds) },
      relations: { invitees: true },
      order: { startTime: 'ASC' },
    });
  }

  async deleteById(id: string): Promise<void> {
    const event = await this.eventsRepository.findOne({
      where: { id },
      relations: { invitees: true },
    });
    if (!event) {
      throw new NotFoundException(`Event with id "${id}" not found`);
    }

    const invitees = event.invitees ?? [];

    // Clear join-table rows before deleting the parent row, otherwise the
    // FOREIGN KEY on event_invitees.event_id blocks the DELETE.
    if (invitees.length > 0) {
      event.invitees = [];
      await this.eventsRepository.save(event);
    }

    // Pull the event id out of every invitee's `events` list.
    for (const user of invitees) {
      user.events = (user.events ?? []).filter((eid) => eid !== id);
      await this.usersRepository.save(user);
    }
    await this.eventsRepository.remove(event);
  }

  /**
   * MergeAll: for the given user, collapse every overlapping pair of
   * events the user is invited to into a single superset event.
   * Per the assignment FAQ:
   *   - Mutates the database (not just a response)
   *   - Appends titles/descriptions and picks a reasonable status
   *   - Union of invitees is preserved
   */
  async mergeAllForUser(userId: string): Promise<Event[]> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }

    const eventIds = (user.events ?? []).filter(Boolean);
    if (eventIds.length === 0) {
      return [];
    }

    const userEvents = await this.eventsRepository.find({
      where: { id: In(eventIds) },
      relations: { invitees: true },
    });

    if (userEvents.length === 0) {
      return [];
    }

    // Sort by startTime so we can sweep and merge.
    const sorted = [...userEvents].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    type Cluster = {
      startTime: Date;
      endTime: Date;
      titles: string[];
      descriptions: string[];
      statuses: EventStatus[];
      members: Event[];
    };

    const clusters: Cluster[] = [];
    for (const ev of sorted) {
      const last = clusters[clusters.length - 1];
      if (last && ev.startTime.getTime() <= last.endTime.getTime()) {
        last.endTime =
          ev.endTime.getTime() > last.endTime.getTime()
            ? ev.endTime
            : last.endTime;
        if (!last.titles.includes(ev.title)) last.titles.push(ev.title);
        if (ev.description && !last.descriptions.includes(ev.description)) {
          last.descriptions.push(ev.description);
        }
        if (!last.statuses.includes(ev.status)) last.statuses.push(ev.status);
        last.members.push(ev);
      } else {
        clusters.push({
          startTime: ev.startTime,
          endTime: ev.endTime,
          titles: [ev.title],
          descriptions: ev.description ? [ev.description] : [],
          statuses: [ev.status],
          members: [ev],
        });
      }
    }

    const merged: Event[] = [];

    for (const cluster of clusters) {
      if (cluster.members.length === 1) {
        merged.push(cluster.members[0]);
        continue;
      }

      const inviteeMap = new Map<string, User>();
      for (const m of cluster.members) {
        for (const u of m.invitees ?? []) {
          inviteeMap.set(u.id, u);
        }
      }
      const mergedInvitees = Array.from(inviteeMap.values());

      const newStatus = pickStatus(cluster.statuses);

      const newEvent = this.eventsRepository.create({
        title: cluster.titles.join(' | '),
        description:
          cluster.descriptions.length > 0
            ? cluster.descriptions.join(' | ')
            : null,
        status: newStatus,
        startTime: cluster.startTime,
        endTime: cluster.endTime,
        invitees: mergedInvitees,
      });

      const saved = await this.eventsRepository.save(newEvent);
      const oldIds = new Set(cluster.members.map((m) => m.id));

      for (const m of cluster.members) {
        m.invitees = [];
        await this.eventsRepository.save(m);
      }
      await this.eventsRepository.delete(Array.from(oldIds));

      for (const u of mergedInvitees) {
        const next = (u.events ?? []).filter((eid) => !oldIds.has(eid));
        if (!next.includes(saved.id)) next.push(saved.id);
        u.events = next;
        await this.usersRepository.save(u);
      }

      merged.push(await this.findById(saved.id));
    }

    return merged;
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private assertTimeRange(start: Date, end: Date): void {
    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('endTime must be after startTime');
    }
  }

  private async appendEventToUsers(
    users: User[],
    eventId: string,
  ): Promise<void> {
    for (const user of users) {
      const current = user.events ?? [];
      if (!current.includes(eventId)) {
        user.events = [...current, eventId];
        await this.usersRepository.save(user);
      }
    }
  }
}

function pickStatus(statuses: EventStatus[]): EventStatus {
  const set = new Set(statuses);
  if (set.has(EventStatus.IN_PROGRESS)) return EventStatus.IN_PROGRESS;
  if (set.has(EventStatus.COMPLETED)) return EventStatus.COMPLETED;
  return EventStatus.TODO;
}
