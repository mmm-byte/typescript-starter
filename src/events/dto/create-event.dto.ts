import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EventStatus } from '../event-status.enum';

export class CreateEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(EventStatus, {
    message: `status must be one of: ${Object.values(EventStatus).join(', ')}`,
  })
  status?: EventStatus;

  @Type(() => Date)
  @IsDate({ message: 'startTime must be a valid ISO date string' })
  startTime!: Date;

  @Type(() => Date)
  @IsDate({ message: 'endTime must be a valid ISO date string' })
  endTime!: Date;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  invitees?: string[];
}
