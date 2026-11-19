import type { AuthUser } from '../common/auth-user.js';

/** Reservas começam e terminam em múltiplos de 15 minutos. */
export const SLOT_MINUTES = 15;
export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_HOURS = 8;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Alinhado ao "relógio": múltiplo de 15 min desde a época Unix (vale para qualquer fuso, já que offsets são múltiplos de 15 min). */
const onSlotBoundary = (date: Date) => date.getTime() % (SLOT_MINUTES * MINUTE) === 0;

/**
 * Regras de negócio sobre o intervalo de uma reserva. Devolve a mensagem do problema, ou `null` se estiver tudo certo.
 * Função pura: recebe `now` por parâmetro para ser determinística nos testes.
 */
export function validateBookingWindow(startsAt: Date, endsAt: Date, now: Date): string | null {
  if (!(startsAt < endsAt)) return '"endsAt" must be after "startsAt"';
  if (startsAt <= now) return 'Bookings must start in the future';
  if (!onSlotBoundary(startsAt) || !onSlotBoundary(endsAt)) {
    return `Start and end times must be aligned to ${SLOT_MINUTES}-minute marks (e.g. 09:00, 09:15)`;
  }
  const duration = endsAt.getTime() - startsAt.getTime();
  if (duration < MIN_DURATION_MINUTES * MINUTE) {
    return `A booking must last at least ${MIN_DURATION_MINUTES} minutes`;
  }
  if (duration > MAX_DURATION_HOURS * HOUR) {
    return `A booking cannot last more than ${MAX_DURATION_HOURS} hours`;
  }
  return null;
}

export type CancellationDecision = { allowed: true } | { allowed: false; reason: string };

/**
 * Usuários comuns só cancelam com antecedência mínima (para o recurso poder ser reaproveitado);
 * administradores cancelam a qualquer momento.
 */
export function decideCancellation(
  booking: { startsAt: Date },
  actor: AuthUser,
  now: Date,
  minHoursBefore: number,
): CancellationDecision {
  if (actor.role === 'ADMIN') return { allowed: true };
  if (booking.startsAt.getTime() - now.getTime() < minHoursBefore * HOUR) {
    return {
      allowed: false,
      reason: `Bookings can only be cancelled up to ${minHoursBefore} hour(s) before they start`,
    };
  }
  return { allowed: true };
}
