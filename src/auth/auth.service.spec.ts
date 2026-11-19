import { ConflictException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { AuthService } from './auth.service.js';

const user = { id: 'u1', email: 'ana@example.com', name: 'Ana', role: 'USER' as const, passwordHash: '' };

function build() {
  const prisma = {
    user: { create: vi.fn(), findUnique: vi.fn() },
    refreshToken: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  };
  const jwt = { signAsync: vi.fn().mockResolvedValue('signed.jwt.token') };
  const settings: Record<string, number> = {
    BCRYPT_COST: 4,
    JWT_ACCESS_TTL_SECONDS: 900,
    REFRESH_TTL_DAYS: 7,
  };
  const config = { get: (key: string) => settings[key] };
  // biome-ignore lint: dublês parciais
  const service = new AuthService(prisma as never, jwt as never, config as never);
  return { service, prisma, jwt };
}

describe('AuthService', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
    user.passwordHash = bcrypt.hashSync('senha-forte-123', 4);
  });

  describe('register', () => {
    it('cria sempre um USER, guarda só o hash e emite os tokens', async () => {
      ctx.prisma.user.create.mockResolvedValue(user);
      const result = await ctx.service.register({
        email: user.email,
        name: 'Ana',
        password: 'senha-forte-123',
      });

      const data = ctx.prisma.user.create.mock.calls[0]![0].data;
      expect(data).not.toHaveProperty('role');
      expect(data.passwordHash).not.toBe('senha-forte-123');
      expect(await bcrypt.compare('senha-forte-123', data.passwordHash)).toBe(true);
      expect(result).toMatchObject({ accessToken: 'signed.jwt.token', tokenType: 'Bearer', expiresIn: 900 });
      expect(result.user).toEqual({ id: 'u1', email: user.email, name: 'Ana', role: 'USER' });
    });

    it('guarda o refresh token apenas como hash sha256', async () => {
      ctx.prisma.user.create.mockResolvedValue(user);
      const result = await ctx.service.register({
        email: user.email,
        name: 'Ana',
        password: 'senha-forte-123',
      });
      const stored = ctx.prisma.refreshToken.create.mock.calls[0]![0].data;
      expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(stored.tokenHash).not.toBe(result.refreshToken);
    });

    it('converte violação de unicidade em 409', async () => {
      ctx.prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
      );
      await expect(
        ctx.service.register({ email: user.email, name: 'Ana', password: 'senha-forte-123' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('propaga erros inesperados', async () => {
      ctx.prisma.user.create.mockRejectedValue(new Error('banco caiu'));
      await expect(
        ctx.service.register({ email: user.email, name: 'Ana', password: 'senha-forte-123' }),
      ).rejects.toThrow('banco caiu');
    });
  });

  describe('login', () => {
    it('emite tokens com credenciais corretas', async () => {
      ctx.prisma.user.findUnique.mockResolvedValue(user);
      const result = await ctx.service.login({ email: user.email, password: 'senha-forte-123' });
      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('senha errada e e-mail inexistente produzem exatamente o mesmo erro', async () => {
      ctx.prisma.user.findUnique.mockResolvedValueOnce(user).mockResolvedValueOnce(null);
      const wrong = await ctx.service.login({ email: user.email, password: 'errada-123' }).catch((e) => e);
      const unknown = await ctx.service.login({ email: 'x@y.com', password: 'errada-123' }).catch((e) => e);
      expect(wrong).toBeInstanceOf(UnauthorizedException);
      expect(unknown).toBeInstanceOf(UnauthorizedException);
      expect(unknown.message).toBe(wrong.message);
    });

    it('compara a senha mesmo quando o e-mail não existe (evita revelar contas pelo tempo de resposta)', async () => {
      const compare = vi.spyOn(bcrypt, 'compare');
      ctx.prisma.user.findUnique.mockResolvedValue(null);
      await ctx.service.login({ email: 'x@y.com', password: 'qualquer-123' }).catch(() => undefined);
      expect(compare).toHaveBeenCalledOnce();
      compare.mockRestore();
    });
  });

  describe('refresh', () => {
    const record = (overrides: object = {}) => ({
      id: 'r1',
      userId: 'u1',
      familyId: 'fam-1',
      tokenHash: 'h',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user,
      ...overrides,
    });

    it('rotaciona: revoga o token usado e emite outro na mesma família', async () => {
      ctx.prisma.refreshToken.findUnique.mockResolvedValue(record());
      ctx.prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await ctx.service.refresh('token-em-texto');

      expect(ctx.prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'r1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(ctx.prisma.refreshToken.create.mock.calls[0]![0].data.familyId).toBe('fam-1');
    });

    it('token desconhecido: 401', async () => {
      ctx.prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(ctx.service.refresh('x')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('token expirado: 401, sem emitir nada', async () => {
      ctx.prisma.refreshToken.findUnique.mockResolvedValue(record({ expiresAt: new Date(Date.now() - 1) }));
      await expect(ctx.service.refresh('x')).rejects.toThrow('expired');
      expect(ctx.prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('token já usado: revoga a família inteira e recusa', async () => {
      ctx.prisma.refreshToken.findUnique.mockResolvedValue(record({ revokedAt: new Date() }));
      ctx.prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await expect(ctx.service.refresh('x')).rejects.toThrow('reuse detected');
      expect(ctx.prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(ctx.prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('corrida: se outra requisição revogou o token primeiro, trata como reuso', async () => {
      ctx.prisma.refreshToken.findUnique.mockResolvedValue(record());
      ctx.prisma.refreshToken.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      await expect(ctx.service.refresh('x')).rejects.toThrow('reuse detected');
      expect(ctx.prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revoga a família do token', async () => {
      ctx.prisma.refreshToken.findUnique.mockResolvedValue({ familyId: 'fam-1' });
      ctx.prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      await ctx.service.logout('x');
      expect(ctx.prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { familyId: 'fam-1', revokedAt: null } }),
      );
    });

    it('é idempotente para token desconhecido', async () => {
      ctx.prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(ctx.service.logout('x')).resolves.toBeUndefined();
      expect(ctx.prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
