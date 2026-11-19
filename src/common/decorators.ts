import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../generated/prisma/enums.js';
import type { AuthUser } from './auth-user.js';

export const IS_PUBLIC_KEY = 'isPublic';
/** Libera a rota da autenticação (por padrão, todas exigem token). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restringe a rota a um ou mais papéis. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injeta o usuário autenticado no parâmetro do handler. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
  return request.user;
});
