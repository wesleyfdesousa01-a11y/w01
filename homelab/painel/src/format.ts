const FUSO = 'America/Sao_Paulo';

function partes(d: Date, opcoes: Intl.DateTimeFormatOptions) {
  return Object.fromEntries(new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, ...opcoes }).formatToParts(d).map((p) => [p.type, p.value]));
}

export function hora(iso?: string | null): string {
  if (!iso) return '';
  const p = partes(new Date(iso), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${p.hour}:${p.minute}`;
}

export function dia(iso: string): string {
  const p = partes(new Date(iso), { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${p.year}-${p.month}-${p.day}`;
}

export function dataCompleta(iso: string): string {
  const p = partes(new Date(iso), { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${p.day}/${p.month}/${p.year}`;
}

// "há 12 min" até 1 h; depois "hoje 14:32"; depois dd/mm/aaaa.
export function relativo(iso?: string | null, agora = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  const min = Math.round((agora.getTime() - d.getTime()) / 60000);
  if (min >= 0 && min < 1) return 'agora';
  if (min >= 0 && min < 60) return `há ${min} min`;
  if (dia(iso) === dia(agora.toISOString())) return `hoje ${hora(iso)}`;
  const ontem = new Date(agora.getTime() - 86400000).toISOString();
  if (dia(iso) === dia(ontem)) return `ontem ${hora(iso)}`;
  return dataCompleta(iso);
}

// "quinta, 30 de outubro" (sem "-feira").
export function dataPorExtenso(d = new Date()): string {
  const p = partes(d, { weekday: 'long', day: 'numeric', month: 'long' });
  return `${p.weekday.replace('-feira', '')}, ${p.day} de ${p.month}`;
}

export function contarCampos(md: string): number {
  return new Set(md.match(/\{\{\s*[a-z0-9_]+\s*\}\}/g)?.map((c) => c.replace(/\s/g, '')) ?? []).size;
}
