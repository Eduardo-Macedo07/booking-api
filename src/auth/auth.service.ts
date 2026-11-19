import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthUser } from '../common/auth-user.js';
import type { Env } from '../config/env.js';
import type { User } from '../generated/prisma/client.js';
import { isUniqueViolation } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthResponseDto, LoginDto, RegisterDto } from './dto/auth.dto.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  /** Hash de uma senha qualquer, usado para gastar o mesmo tempo quando o e-mail não existe. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const passwordHash = await bcrypt.hash(dto.password, this.config.get('BCRYPT_COST', { infer: true }));
    try {
      // O papel nunca vem do cliente: todo cadastro público é USER. O primeiro ADMIN vem do seed.
      const user = await this.prisma.user.create({
        data: { email: dto.email, name: dto.name, passwordHash },
      });
      return await this.issueTokens(user, randomUUID());
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Email already registered');
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Compara sempre (mesmo sem usuário) e responde igual nos dois casos:
    // evita revelar, pelo tempo ou pela mensagem, quais e-mails estão cadastrados.
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const valid = await bcrypt.compare(dto.password, hash);
    if (!user || !valid) throw new UnauthorizedException('Invalid credentials');
    return this.issueTokens(user, randomUUID());
  }

  /**
   * Rotação de refresh token com detecção de reuso: cada token vale uma vez.
   * Se um token já usado reaparece, alguém o copiou — a família inteira é revogada.
   */
  async refresh(rawToken: string): Promise<AuthResponseDto> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: true },
    });
    if (!record) throw new UnauthorizedException('Invalid refresh token');

    const now = new Date();
    if (record.revokedAt) {
      await this.revokeFamily(record.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (record.expiresAt <= now) throw new UnauthorizedException('Refresh token expired');

    // Revoga só se ainda estiver ativo: se duas requisições disputam o mesmo token, só uma vence.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (count === 0) {
      await this.revokeFamily(record.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    return this.issueTokens(record.user, record.familyId);
  }

  /** Encerra a sessão (revoga a família do token). Idempotente: token desconhecido não é erro. */
  async logout(rawToken: string): Promise<void> {
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (record) await this.revokeFamily(record.familyId);
  }

  async me(auth: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: auth.id } });
    if (!user) throw new UnauthorizedException();
    return this.toUserDto(user);
  }

  private revokeFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= bcrypt.hash(randomUUID(), this.config.get('BCRYPT_COST', { infer: true }));
    return this.dummyHash;
  }

  private async issueTokens(user: User, familyId: string): Promise<AuthResponseDto> {
    const expiresIn = this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
    const refreshTtlDays = this.config.get('REFRESH_TTL_DAYS', { infer: true });

    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role }, { expiresIn });
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtlDays * 86_400_000),
      },
    });
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn, user: this.toUserDto(user) };
  }

  private toUserDto(user: User) {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}
