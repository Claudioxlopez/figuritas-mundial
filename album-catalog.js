/** Catálogo Mundial 2026 — planilla de control (orden de la planilla). */

const COUNTRY_ROWS = [
  { code: 'MEX', name: 'México', flag: 'MX' },
  { code: 'RSA', name: 'Sudáfrica', flag: 'ZA' },
  { code: 'KOR', name: 'Corea del Sur', flag: 'KR' },
  { code: 'CZE', name: 'República Checa', flag: 'CZ' },
  { code: 'CAN', name: 'Canadá', flag: 'CA' },
  { code: 'BIH', name: 'Bosnia y Herzegovina', flag: 'BA' },
  { code: 'QAT', name: 'Qatar', flag: 'QA' },
  { code: 'SUI', name: 'Suiza', flag: 'CH' },
  { code: 'BRA', name: 'Brasil', flag: 'BR' },
  { code: 'MAR', name: 'Marruecos', flag: 'MA' },
  { code: 'HAI', name: 'Haití', flag: 'HT' },
  { code: 'SCO', name: 'Escocia', flagEmoji: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { code: 'USA', name: 'Estados Unidos', flag: 'US' },
  { code: 'PAR', name: 'Paraguay', flag: 'PY' },
  { code: 'AUS', name: 'Australia', flag: 'AU' },
  { code: 'TUR', name: 'Turquía', flag: 'TR' },
  { code: 'GER', name: 'Alemania', flag: 'DE' },
  { code: 'CAW', name: 'Curaçao', flag: 'CW' },
  { code: 'CIV', name: 'Costa de Marfil', flag: 'CI' },
  { code: 'ECU', name: 'Ecuador', flag: 'EC' },
  { code: 'NED', name: 'Países Bajos', flag: 'NL' },
  { code: 'JPN', name: 'Japón', flag: 'JP' },
  { code: 'SWE', name: 'Suecia', flag: 'SE' },
  { code: 'TUN', name: 'Túnez', flag: 'TN' },
  { code: 'BEL', name: 'Bélgica', flag: 'BE' },
  { code: 'EGY', name: 'Egipto', flag: 'EG' },
  { code: 'IRN', name: 'Irán', flag: 'IR' },
  { code: 'NZL', name: 'Nueva Zelanda', flag: 'NZ' },
  { code: 'ESP', name: 'España', flag: 'ES' },
  { code: 'CPV', name: 'Cabo Verde', flag: 'CV' },
  { code: 'KSA', name: 'Arabia Saudita', flag: 'SA' },
  { code: 'URU', name: 'Uruguay', flag: 'UY' },
  { code: 'FRA', name: 'Francia', flag: 'FR' },
  { code: 'SEN', name: 'Senegal', flag: 'SN' },
  { code: 'IRQ', name: 'Irak', flag: 'IQ' },
  { code: 'NOR', name: 'Noruega', flag: 'NO' },
  { code: 'ARG', name: 'Argentina', flag: 'AR' },
  { code: 'ALG', name: 'Argelia', flag: 'DZ' },
  { code: 'AUT', name: 'Austria', flag: 'AT' },
  { code: 'JOR', name: 'Jordania', flag: 'JO' },
  { code: 'POR', name: 'Portugal', flag: 'PT' },
  { code: 'COD', name: 'Rep. Dem. del Congo', flag: 'CD' },
  { code: 'UZB', name: 'Uzbekistán', flag: 'UZ' },
  { code: 'COL', name: 'Colombia', flag: 'CO' },
  { code: 'ENG', name: 'Inglaterra', flagEmoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { code: 'CRO', name: 'Croacia', flag: 'HR' },
  { code: 'GHA', name: 'Ghana', flag: 'GH' },
  { code: 'PAN', name: 'Panamá', flag: 'PA' },
];

function countryStickers(code, count = 20) {
  return Array.from({ length: count }, (_, i) => `${code}${i + 1}`);
}

const FWC_STICKERS = ['00', ...Array.from({ length: 19 }, (_, i) => `FWC${i + 1}`)];

const CC_STICKERS = Array.from({ length: 14 }, (_, i) => `CC${i + 1}`);

export const ALBUM_GROUPS = [
  {
    id: 'fwc',
    type: 'special',
    code: 'FWC',
    name: 'FIFA World Cup',
    icon: '🏆',
    stickers: FWC_STICKERS,
  },
  ...COUNTRY_ROWS.map((row) => ({
    id: row.code.toLowerCase(),
    type: 'country',
    code: row.code,
    name: row.name,
    flag: row.flag,
    flagEmoji: row.flagEmoji,
    stickers: countryStickers(row.code),
  })),
  {
    id: 'cc',
    type: 'special',
    code: 'CC',
    name: 'Coca-Cola',
    icon: '🥤',
    stickers: CC_STICKERS,
  },
];

/** Orden planilla: países primero, FWC y CC al final (como en la imagen). */
export const ALBUM_GROUPS_PLANILLA = [
  ...COUNTRY_ROWS.map((row) => ({
    id: row.code.toLowerCase(),
    type: 'country',
    code: row.code,
    name: row.name,
    flag: row.flag,
    flagEmoji: row.flagEmoji,
    stickers: countryStickers(row.code),
  })),
  {
    id: 'fwc',
    type: 'special',
    code: 'FWC',
    name: 'FIFA World Cup',
    icon: '🏆',
    stickers: FWC_STICKERS,
  },
  {
    id: 'cc',
    type: 'special',
    code: 'CC',
    name: 'Coca-Cola',
    icon: '🥤',
    stickers: CC_STICKERS,
  },
];

export const ALL_STICKER_IDS = ALBUM_GROUPS_PLANILLA.flatMap((g) => g.stickers);
export const STICKER_ID_SET = new Set(ALL_STICKER_IDS);
export const ALBUM_TOTAL = ALL_STICKER_IDS.length;

export function isValidStickerId(id) {
  return STICKER_ID_SET.has(id);
}

export function flagFromIso(iso) {
  if (!iso || iso.length !== 2) return '';
  return iso
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join('');
}

export function groupFlag(group) {
  if (group.flagEmoji) return group.flagEmoji;
  if (group.icon) return group.icon;
  return flagFromIso(group.flag);
}
