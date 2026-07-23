import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './user.entity';
import { EventsService } from '../events/events.service';
import { Event } from '../events/event.entity';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly eventsService: EventsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<User> {
    return this.usersService.findById(id);
  }

  /** Merge all overlapping events for the user (per assignment spec). */
  @Post(':id/merge-events')
  @HttpCode(HttpStatus.OK)
  mergeEvents(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Event[]> {
    return this.eventsService.mergeAllForUser(id);
  }
}
