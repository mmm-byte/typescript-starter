import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { Event } from './event.entity';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createEventDto: CreateEventDto): Promise<Event> {
    return this.eventsService.create(createEventDto);
  }

  /**
   * GET /events           — returns all events
   * GET /events?userId=:id — returns only events the user is invited to
   */
  @Get()
  findAll(@Query('userId') userId?: string): Promise<Event[]> {
    if (userId) {
      return this.eventsService.findAllForUser(userId);
    }
    return this.eventsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<Event> {
    return this.eventsService.findById(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.eventsService.deleteById(id);
  }

  /**
   * POST /events/merge/:userId
   *
   * MergeAll — collapses every pair of overlapping events for the given
   * user into a single superset event. Mutates the database per
   * assignment FAQ #2.
   * Also available as POST /users/:id/merge-events on UsersController.
   */
  @Post('merge/:userId')
  @HttpCode(HttpStatus.OK)
  mergeAll(
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<Event[]> {
    return this.eventsService.mergeAllForUser(userId);
  }
}
