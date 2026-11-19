import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.js';

export class CreateResourceDto {
  @ApiProperty({ example: 'Sala de reunião A', maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'Projetor e quadro branco', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 1000, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity?: number;
}

export class UpdateResourceDto extends PartialType(CreateResourceDto) {
  @ApiPropertyOptional({ description: 'Desativar impede novas reservas (as existentes são mantidas).' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ListResourcesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca parcial pelo nome (sem diferenciar maiúsculas).' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Somente administradores veem recursos inativos.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  active?: boolean;
}

export class AvailabilityQueryDto {
  @ApiProperty({ example: '2027-03-01T00:00:00Z' })
  @Type(() => Date)
  @IsDate()
  from!: Date;

  @ApiProperty({ example: '2027-03-02T00:00:00Z' })
  @Type(() => Date)
  @IsDate()
  to!: Date;
}
