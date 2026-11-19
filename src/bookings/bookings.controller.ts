import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators.js';
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto, ListBookingsQueryDto } from './dto/booking.dto.js';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @ApiOperation({
    summary: 'Cria uma reserva',
    description:
      'Respostas de erro de negócio trazem `code`: BOOKING_OVERLAP (recurso ocupado), USER_OVERLAP ' +
      '(você já tem outra reserva no período), INVALID_BOOKING_WINDOW, RESOURCE_INACTIVE.',
  })
  @ApiConflictResponse({ description: 'Conflito de horário (recurso ou usuário)' })
  @ApiUnprocessableEntityResponse({ description: 'Recurso inativo' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.bookings.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista reservas (as suas; admin vê todas e pode filtrar por usuário)' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListBookingsQueryDto) {
    return this.bookings.list(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes de uma reserva' })
  @ApiNotFoundResponse()
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.get(user, id);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancela uma reserva',
    description:
      'Usuários cancelam até N horas antes do início (CANCELLATION_MIN_HOURS); admin, a qualquer momento.',
  })
  @ApiConflictResponse({ description: 'Reserva já cancelada' })
  @ApiUnprocessableEntityResponse({ description: 'Fora do prazo de cancelamento' })
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.cancel(user, id);
  }
}
