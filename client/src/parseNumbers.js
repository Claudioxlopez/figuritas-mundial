const ALBUM_MAX = 980;

/** Parsea "1, 5, 10-15, 20" → [1,5,10,11,12,13,14,15,20] */
export function parseNumberList(text) {
  const result = new Set();
  const parts = text
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map((x) => parseInt(x.trim(), 10));
      if (Number.isNaN(a) || Number.isNaN(b)) throw new Error(`Rango inválido: ${part}`);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (let n = lo; n <= hi; n++) {
        if (n < 1 || n > ALBUM_MAX) throw new Error(`Fuera de álbum: ${n}`);
        result.add(n);
      }
    } else {
      const n = parseInt(part, 10);
      if (Number.isNaN(n) || n < 1 || n > ALBUM_MAX) throw new Error(`Número inválido: ${part}`);
      result.add(n);
    }
  }
  return [...result].sort((a, b) => a - b);
}

/** Parsea líneas "45" o "45 x3" o "45x2" */
export function parseAvailableLines(text) {
  const items = [];
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(\d+)\s*(?:x\s*(\d+)|×\s*(\d+))?$/i);
    if (!match) throw new Error(`Línea inválida: ${line}`);
    const number = parseInt(match[1], 10);
    const quantity = parseInt(match[2] || match[3] || '1', 10);
    if (number < 1 || number > ALBUM_MAX) throw new Error(`Fuera de álbum: ${number}`);
    if (quantity < 1) throw new Error(`Cantidad inválida en #${number}`);
    items.push({ number, quantity });
  }
  return items;
}

export function formatAvailableList(available) {
  return available.map((a) => (a.quantity > 1 ? `${a.number} x${a.quantity}` : `${a.number}`)).join('\n');
}

export function formatNumberList(numbers) {
  if (!numbers.length) return '';
  const sorted = [...numbers].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = cur;
    prev = cur;
  }
  return ranges.join(', ');
}
