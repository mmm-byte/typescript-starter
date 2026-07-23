import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EventStatus } from './event-status.enum';
import { User } from '../users/user.entity';

/**
 * `status` is stored as varchar(32) rather than a native SQL ENUM so that
 * the same schema works with SQLite (no native ENUM type), MySQL, and
 * PostgreSQL without a migration change. TypeORM's native `enum` column
 * type is Postgres-only and breaks on SQLite. Values are still fully
 * constrained at the application layer via the EventStatus enum and
 * class-validator's @IsEnum decorator on CreateEventDto.
 *
 * To use a native Postgres ENUM instead, change the column definition to:
 *   @Column({ type: 'enum', enum: EventStatus, default: EventStatus.TODO })
 * and remove this comment.
 */
@Entity({ name: 'events' })
@Index(['startTime', 'endTime'])
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: EventStatus.TODO,
  })
  status!: EventStatus;

  @Column({ type: 'datetime' })
  startTime!: Date;

  @Column({ type: 'datetime' })
  endTime!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToMany(() => User, (user) => user.invitedEvents)
  invitees?: User[];
}
