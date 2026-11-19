export interface Interval {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Dado o período [from, to) e as reservas confirmadas, devolve as janelas livres.
 * Função pura (sem banco): é onde mora a lógica, para ser testada isoladamente.
 */
export function computeFreeWindows(from: Date, to: Date, busy: Interval[]): Interval[] {
  const sorted = [...busy].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const free: Interval[] = [];
  let cursor = from;

  for (const slot of sorted) {
    if (slot.endsAt <= cursor) continue; // já coberto
    if (slot.startsAt >= to) break;
    if (slot.startsAt > cursor) free.push({ startsAt: cursor, endsAt: slot.startsAt });
    if (slot.endsAt > cursor) cursor = slot.endsAt;
  }
  if (cursor < to) free.push({ startsAt: cursor, endsAt: to });
  return free;
}

/** Limita um intervalo ao período consultado. */
export function clip(slot: Interval, from: Date, to: Date): Interval {
  return {
    startsAt: slot.startsAt < from ? from : slot.startsAt,
    endsAt: slot.endsAt > to ? to : slot.endsAt,
  };
}
