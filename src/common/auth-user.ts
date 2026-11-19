import type { Role } from '../generated/prisma/enums.js';

/** Usuário autenticado, colocado em `request.user` pelo JwtAuthGuard. */
export interface AuthUser {
  id: string;
  role: Role;
}
