export type LossNarrative = { id: string; name: string; url?: string; lostReasonNarrative?: string | null };
const STOP = new Set(`a al algo algun alguna algunas alguno algunos ante antes asi aun aunque bajo bien cada casi como con contra cual cuando de del desde despues donde e el ella ellas ello ellos en entre era eran es esa esas ese eso esos esta estaba estaban estamos estan estar estas este esto estos fue fueron ha habia han hasta hay la las le les lo los mas me mi mis mientras mismo mucha mucho muy nada ni no nos nosotros nuestra nuestro o otra otro para pero por porque puede pueden que quien se sea segun ser si sido sin sobre solo son su sus tal tambien tanto te tener tiene tienen todo todos tras tu tus un una unas uno unos usted ustedes va vamos y ya the and for with this that cliente clientes empresa empresas deal deals perdido perdidos motivo motivos razon razones adereso cassper proyecto propuesta solucion necesita necesitan quiere quieren poder pudimos proceso producto insuficiente explicar otro`.split(/\s+/));
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
export function lossNarrativeText(text: string | null | undefined): string {
  return (text ?? '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|lt|gt|quot|#\d+);/gi, ' ').replace(/\s+/g, ' ').trim();
}
export function lossNarrativeTerms(text: string): string[] {
  const cleaned = lossNarrativeText(text).replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, ' ');
  return [...new Set((normalize(cleaned).match(/\p{L}+/gu) ?? []).filter(word => word.length >= 2 && !STOP.has(word)))];
}
export function buildLossReasonWords(input: LossNarrative[], limit = 32) {
  const deals = [...new Map(input.map(deal => [deal.id, deal])).values()];
  const comments = deals.map(deal => ({ ...deal, text: lossNarrativeText(deal.lostReasonNarrative) })).filter(deal => deal.text);
  const terms = new Map<string, typeof comments>();
  for (const comment of comments) for (const term of lossNarrativeTerms(comment.text)) terms.set(term, [...(terms.get(term) ?? []), comment]);
  const words = [...terms].map(([term, comments]) => ({ term, count: comments.length, comments }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term, 'es')).slice(0, Math.max(0, limit));
  return { total: deals.length, commented: comments.length, words };
}
