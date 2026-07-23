import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { Event } from './event.entity';
import { User } from '../users/user.entity';
import { EventStatus } from './event-status.enum';

describe('EventsController', () => {
  let controller: EventsController;
  let service: EventsService;

  const eventRepoMock = {
    rows: new Map(),
    create: jest.fn((d) => d),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
  };
  const userRepoMock = {
    rows: new Map(),
    create: jest.fn((d) => d),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        EventsService,
        { provide: getRepositoryToken(Event), useValue: eventRepoMock },
        { provide: getRepositoryToken(User), useValue: userRepoMock },
      ],
    }).compile();

    controller = moduleRef.get(EventsController);
    service = moduleRef.get(EventsService);

    jest
      .spyOn(service, 'create')
      .mockImplementation(async (dto) =>
        ({
          id: 'fixed-id',
          title: dto.title,
          description: dto.description ?? null,
          status: dto.status ?? EventStatus.TODO,
          startTime: dto.startTime,
          endTime: dto.endTime,
        }) as unknown as Event,
      );

    jest
      .spyOn(service, 'findAll')
      .mockResolvedValue([{ id: 'ev-all' } as unknown as Event]);

    jest
      .spyOn(service, 'findAllForUser')
      .mockResolvedValue([{ id: 'ev-user' } as unknown as Event]);

    jest
      .spyOn(service, 'findById')
      .mockImplementation(async (id) => ({ id } as unknown as Event));

    jest
      .spyOn(service, 'deleteById')
      .mockImplementation(async () => undefined);

    jest
      .spyOn(service, 'mergeAllForUser')
      .mockResolvedValue([{ id: 'merged-id' } as unknown as Event]);
  });

  it('POST /events -> service.create()', async () => {
    const dto = {
      title: 'x',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3_600_000),
    };
    const result = await controller.create(dto as never);
    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result.id).toBe('fixed-id');
  });

  it('GET /events (no userId) -> service.findAll()', async () => {
    const result = await controller.findAll(undefined);
    expect(service.findAll).toHaveBeenCalled();
    expect(service.findAllForUser).not.toHaveBeenCalled();
    expect(result[0].id).toBe('ev-all');
  });

  it('GET /events?userId=u-1 -> service.findAllForUser()', async () => {
    const result = await controller.findAll('u-1');
    expect(service.findAllForUser).toHaveBeenCalledWith('u-1');
    expect(service.findAll).not.toHaveBeenCalled();
    expect(result[0].id).toBe('ev-user');
  });

  it('GET /events/:id -> service.findById()', async () => {
    const result = await controller.findOne('abc');
    expect(service.findById).toHaveBeenCalledWith('abc');
    expect(result.id).toBe('abc');
  });

  it('DELETE /events/:id -> service.deleteById()', async () => {
    await controller.remove('abc');
    expect(service.deleteById).toHaveBeenCalledWith('abc');
  });

  it('POST /events/merge/:userId -> service.mergeAllForUser()', async () => {
    const result = await controller.mergeAll('u-99');
    expect(service.mergeAllForUser).toHaveBeenCalledWith('u-99');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('merged-id');
  });
});
