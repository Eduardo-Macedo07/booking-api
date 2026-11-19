import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import {
  AvailabilityQueryDto,
  CreateResourceDto,
  ListResourcesQueryDto,
  UpdateResourceDto,
} from './dto/resource.dto.js';
import { ResourcesService } from './resources.service.js';

@ApiTags('resources')
@ApiBearerAuth()
@Controller('resources')
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista recursos reserváveis (paginado, com busca por nome)' })
  list(@Query() query: ListResourcesQueryDto, @CurrentUser() user: AuthUser) {
    return this.resources.list(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes de um recurso' })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.resources.get(id, user);
  }

  @Get(':id/availability')
  @ApiOperation({
    summary: 'Horários ocupados e janelas livres de um recurso em um período (máx. 31 dias)',
  })
  availability(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AvailabilityQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.resources.availability(id, query, user);
  }

  @Roles('ADMIN')
  @Post()
  @ApiOperation({ summary: 'Cria um recurso (admin)' })
  @ApiForbiddenResponse({ description: 'Somente administradores' })
  @ApiConflictResponse({ description: 'Já existe recurso com esse nome' })
  create(@Body() dto: CreateResourceDto) {
    return this.resources.create(dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza um recurso (admin)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateResourceDto) {
    return this.resources.update(id, dto);
  }

  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  @ApiOperation({ summary: 'Desativa um recurso (admin); reservas existentes são mantidas' })
  async deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.resources.deactivate(id);
  }
}
