/** Lossless transport: repeated deal DTOs travel once, not once per chart/list. */
export type ReportWire<T> = { version: 'report-wire/v1'; payload: unknown; deals: unknown[]; __type?: T };

export function packReport<T>(report: T): ReportWire<T> {
  const deals: unknown[] = [];
  const indices = new Map<string, number>();
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    const object = value as Record<string, unknown>;
    if (typeof object['id'] === 'string' && typeof object['ownerId'] === 'string' &&
      typeof object['stageId'] === 'string' && typeof object['amountValue'] === 'number') {
      // Match the entire DTO, not only its ID: distinct versions must stay distinct.
      const signature = JSON.stringify(object);
      let index = indices.get(signature);
      if (index === undefined) {
        index = deals.length;
        indices.set(signature, index);
        deals.push(object);
      }
      return { $deal: index };
    }
    return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, visit(item)]));
  };
  return { version: 'report-wire/v1', payload: visit(report), deals };
}

export function unpackReport<T>(input: ReportWire<T> | T): T {
  if (!input || typeof input !== 'object' || !('version' in input) || input.version !== 'report-wire/v1') return input as T;
  const wire = input as ReportWire<T>;
  if (!Array.isArray(wire.deals)) throw new Error('Copia del reporte inválida');
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    const object = value as Record<string, unknown>;
    if (Object.keys(object).length === 1 && '$deal' in object) {
      const index = object['$deal'];
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= wire.deals.length) throw new Error('Referencia del reporte inválida');
      return wire.deals[index];
    }
    return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, visit(item)]));
  };
  return visit(wire.payload) as T;
}