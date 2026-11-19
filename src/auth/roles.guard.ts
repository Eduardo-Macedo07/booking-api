import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from '../common/auth-user.js';
import { ROLES_KEY } from '../common/decorators.js';
import type { Role } from '../generated/prisma/enums.js';

/** Guard global: aplica @Roles(...) depois que o JwtAuthGuard identificou o usuário. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
