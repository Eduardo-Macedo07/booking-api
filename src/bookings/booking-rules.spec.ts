import { describe, expect, it } from 'vitest';
import { decideCancellation, validateBookingWindow } from './booking-rules.js';

const NOW = new Date('2027-03-01T10:00:00Z');
const at = (iso: string) => new Date(iso);

describe('validateBookingWindow', () => {
  it('aceita uma reserva válida', () => {
    expect(validateBookingWindow(at('2027-03-01T14:00:00Z'), at('2027-03-01T15:30:00Z'), NOW)).toBeNull();
  });

  it('aceita os limites: 15 minutos e 8 horas', () => {
    expect(validateBookingWindow(at('2027-03-01T14:00:00Z'), at('2027-03-01T14:15:00Z'), NOW)).toBeNull();
    expect(
      validateBookingWindow(
        at('2027-03-01T08:00:00Z'),
        at('2027-03-01T16:00:00Z'),
        at('2027-02-28T00:00:00Z'),
      ),
    ).toBeNull();
  });

  it.each([
    ['fim igual ao início', '2027-03-01T14:00:00Z', '2027-03-01T14:00:00Z', 'must be after'],
    ['fim antes do início', '2027-03-01T15:00:00Z', '2027-03-01T14:00:00Z', 'must be after'],
    ['no passado', '2027-03-01T09:00:00Z', '2027-03-01T09:30:00Z', 'future'],
    ['começando agora', '2027-03-01T10:00:00Z', '2027-03-01T11:00:00Z', 'future'],
    ['início fora da grade de 15 min', '2027-03-01T14:10:00Z', '2027-03-01T15:00:00Z', '15-minute'],
    ['fim fora da grade de 15 min', '2027-03-01T14:00:00Z', '2027-03-01T14:50:00Z', '15-minute'],
    ['com segundos', '2027-03-01T14:00:30Z', '2027-03-01T15:00:00Z', '15-minute'],
    ['mais de 8 horas', '2027-03-01T11:00:00Z', '2027-03-01T19:15:00Z', '8 hours'],
  ])('recusa reserva %s', (_nome, start, end, message) => {
    expect(validateBookingWindow(at(start), at(end), NOW)).toContain(message);
  });
});

describe('decideCancellation', () => {
  const owner = { id: 'u1', role: 'USER' as const };
  const admin = { id: 'a1', role: 'ADMIN' as const };

  it('usuário cancela com antecedência suficiente', () => {
    expect(decideCancellation({ startsAt: at('2027-03-01T12:30:00Z') }, owner, NOW, 2)).toEqual({
      allowed: true,
    });
  });

  it('o limite é inclusivo: exatamente 2h antes ainda pode', () => {
    expect(decideCancellation({ startsAt: at('2027-03-01T12:00:00Z') }, owner, NOW, 2)).toEqual({
      allowed: true,
    });
  });

  it('usuário não cancela com menos antecedência que a mínima', () => {
    const decision = decideCancellation({ startsAt: at('2027-03-01T11:59:00Z') }, owner, NOW, 2);
    expect(decision).toMatchObject({ allowed: false });
    expect((decision as { reason: string }).reason).toContain('2 hour');
  });

  it('admin cancela a qualquer momento, até reservas em andamento', () => {
    expect(decideCancellation({ startsAt: at('2027-03-01T09:00:00Z') }, admin, NOW, 2)).toEqual({
      allowed: true,
    });
  });

  it('com mínimo 0, qualquer reserva futura pode ser cancelada', () => {
    expect(decideCancellation({ startsAt: at('2027-03-01T10:01:00Z') }, owner, NOW, 0)).toEqual({
      allowed: true,
    });
  });
});
