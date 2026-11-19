import { describe, expect, it } from 'vitest';
import { clip, computeFreeWindows, type Interval } from './availability.js';

const t = (hhmm: string) => new Date(`2027-03-01T${hhmm}:00Z`);
const slot = (a: string, b: string): Interval => ({ startsAt: t(a), endsAt: t(b) });
const fmt = (slots: Interval[]) =>
  slots.map((s) => `${s.startsAt.toISOString().slice(11, 16)}-${s.endsAt.toISOString().slice(11, 16)}`);

describe('computeFreeWindows', () => {
  it('sem reservas, o período inteiro está livre', () => {
    expect(fmt(computeFreeWindows(t('08:00'), t('18:00'), []))).toEqual(['08:00-18:00']);
  });

  it('devolve as janelas entre as reservas', () => {
    const busy = [slot('10:00', '11:00'), slot('13:00', '14:00')];
    expect(fmt(computeFreeWindows(t('08:00'), t('18:00'), busy))).toEqual([
      '08:00-10:00',
      '11:00-13:00',
      '14:00-18:00',
    ]);
  });

  it('não gera janela vazia entre reservas coladas', () => {
    const busy = [slot('10:00', '11:00'), slot('11:00', '12:00')];
    expect(fmt(computeFreeWindows(t('08:00'), t('18:00'), busy))).toEqual(['08:00-10:00', '12:00-18:00']);
  });

  it('funciona com reservas fora de ordem', () => {
    const busy = [slot('13:00', '14:00'), slot('10:00', '11:00')];
    expect(fmt(computeFreeWindows(t('08:00'), t('18:00'), busy))).toEqual([
      '08:00-10:00',
      '11:00-13:00',
      '14:00-18:00',
    ]);
  });

  it('reserva que começa antes do período recorta o início', () => {
    expect(fmt(computeFreeWindows(t('08:00'), t('18:00'), [slot('07:00', '09:00')]))).toEqual([
      '09:00-18:00',
    ]);
  });

  it('reserva que termina depois do período recorta o fim', () => {
    expect(fmt(computeFreeWindows(t('08:00'), t('18:00'), [slot('17:00', '20:00')]))).toEqual([
      '08:00-17:00',
    ]);
  });

  it('período totalmente ocupado não tem janela livre', () => {
    expect(computeFreeWindows(t('08:00'), t('18:00'), [slot('07:00', '19:00')])).toEqual([]);
  });

  it('ignora reservas fora do período', () => {
    const busy = [slot('05:00', '06:00'), slot('19:00', '20:00')];
    expect(fmt(computeFreeWindows(t('08:00'), t('18:00'), busy))).toEqual(['08:00-18:00']);
  });

  it('tolera reservas sobrepostas nos dados (defensivo)', () => {
    const busy = [slot('10:00', '12:00'), slot('11:00', '13:00')];
    expect(fmt(computeFreeWindows(t('08:00'), t('18:00'), busy))).toEqual(['08:00-10:00', '13:00-18:00']);
  });

  it('não altera o array recebido', () => {
    const busy = [slot('13:00', '14:00'), slot('10:00', '11:00')];
    computeFreeWindows(t('08:00'), t('18:00'), busy);
    expect(fmt(busy)).toEqual(['13:00-14:00', '10:00-11:00']);
  });
});

describe('clip', () => {
  it('recorta nas duas pontas e preserva o que já está dentro', () => {
    expect(fmt([clip(slot('07:00', '19:00'), t('08:00'), t('18:00'))])).toEqual(['08:00-18:00']);
    expect(fmt([clip(slot('10:00', '11:00'), t('08:00'), t('18:00'))])).toEqual(['10:00-11:00']);
  });
});
