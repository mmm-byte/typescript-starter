import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './events/event.entity';
import { User } from './users/user.entity';
import { EventsModule } from './events/events.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: process.env.DB_PATH ?? 'data.sqlite',
      entities: [Event, User],
      synchronize: true, // dev/demo only — fine per the assignment
    }),
    EventsModule,
    UsersModule,
  ],
})
export class AppModule {}
