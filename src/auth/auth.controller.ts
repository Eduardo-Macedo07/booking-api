import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public } from '../common/decorators.js';
import { AuthService } from './auth.service.js';
import { AuthResponseDto, LoginDto, RefreshDto, RegisterDto, UserResponseDto } from './dto/auth.dto.js';

// Estas rotas têm um limite de requisições mais apertado (força bruta); ver AppModule ("auth" throttler).
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Cria uma conta (papel USER) e já devolve os tokens' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({ description: 'E-mail já cadastrado' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Autentica com e-mail e senha' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Credenciais inválidas' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiOperation({
    summary: 'Troca um refresh token por um novo par de tokens',
    description:
      'Cada refresh token só pode ser usado uma vez. Reusar um token já trocado revoga toda a sessão.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Token inválido, expirado ou reutilizado' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiOperation({ summary: 'Encerra a sessão (revoga o refresh token e os derivados dele)' })
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Dados do usuário autenticado' })
  @ApiOkResponse({ type: UserResponseDto })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }
}
