import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { EventsService } from '../events/events.service';
import { User } from './user.entity';
import { Event } from '../events/event.entity';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: UsersService;
  let eventsService: EventsService;

  const userRepoMock = {
    create: jest.fn((d) => d),
    save: jest.fn(async (u: User) => ({ id: 'u-1', ...u } as User)),
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const eventRepoMock = { rows: new Map(), findOne: jest.fn() };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        UsersService,
        EventsService,
        { provide: getRepositoryToken(User), useValue: userRepoMock },
        { provide: getRepositoryToken(Event), useValue: eventRepoMock },
      ],
    }).compile();

    controller = moduleRef.get(UsersController);
    usersService = moduleRef.get(UsersService);
    eventsService = moduleRef.get(EventsService);

    jest
      .spyOn(usersService, 'create')
      .mockImplementation(async (dto) => ({ id: 'u-1', ...dto } as User));
    jest
      .spyOn(eventsService, 'mergeAllForUser')
      .mockImplementation(async (id) => [
        { id: 'merged-1', title: 'Merged' } as unknown as Event,
      ]);
  });

  it('POST /users -> usersService.create()', async () => {
    const result = await controller.create({ name: 'Ada' } as never);
    expect(usersService.create).toHaveBeenCalled();
    expect((result as User).id).toBe('u-1');
  });

  it('POST /users/:id/merge-events -> eventsService.mergeAllForUser()', async () => {
    const result = await controller.mergeEvents('u-1');
    expect(eventsService.mergeAllForUser).toHaveBeenCalledWith('u-1');
    expect(result).toHaveLength(1);
  });
});
