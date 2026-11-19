import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.js';

export class CreateBookingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  resourceId!: string;

  @ApiProperty({ example: '2027-03-01T14:00:00Z', description: 'Múltiplo de 15 minutos.' })
  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @ApiProperty({ example: '2027-03-01T15:30:00Z', description: 'Entre 15 minutos e 8 horas após o início.' })
  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ListBookingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['CONFIRMED', 'CANCELLED'] })
  @IsOptional()
  @IsEnum({ CONFIRMED: 'CONFIRMED', CANCELLED: 'CANCELLED' })
  status?: 'CONFIRMED' | 'CANCELLED';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Somente administradores podem filtrar por outro usuário.',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Reservas que terminam depois deste instante.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ description: 'Reservas que começam antes deste instante.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
