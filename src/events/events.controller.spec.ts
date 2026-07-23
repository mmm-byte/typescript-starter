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
      .spyOn(service, 'findById')
      .mockImplementation(async (id) => ({ id } as unknown as Event));
    jest
      .spyOn(service, 'deleteById')
      .mockImplementation(async () => undefined);
  });

  it('POST /events -> service.create()', async () => {
    const dto = {
      title: 'x',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600_000),
    };
    const result = await controller.create(dto as never);
    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result.id).toBe('fixed-id');
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
});
