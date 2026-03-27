// js/causas-improcedentes.js
// Lista centralizada de causas improcedentes — usada em todos os módulos

// Causas improcedentes normalizadas (sem acentos, só alfanumérico+espaço)
const CAUSAS_IMPROCEDENTES_NORM = [
  "ACESSO IMPEDIDO",
  "DISJUNTOR BT CLIENTE DESARMADO",
  "DISJUNTOR MT GRUPO A DESARMADO",
  "ENCONTRADO ENERGIA CORTADA CLIENTE",
  "ENCONTRADO NORMAL UC",
  "ENDERECO NAO LOCALIZADO",
  "ILUMINACAO PUBLICA COM DEFEITO",
  "INSTALACAO APOS MEDICAO COM DEFEITO CLIENTE",
  "PORTEIRA TRANCADA",
  "REDE TELEFONICA TV A CABO",
  "DISJUNTOR BT CLIENTE COM DEFEITO",
  "RAMAL DE ENTRADA COM DEFEITO CLIENTE"
];

// Palavras-chave para casos com encoding corrompido (ex: Ç→? ou C?)
// Se a causa contiver TODAS as palavras de um conjunto, é improcedente
const CAUSAS_KEYWORDS = [
  ["INSTALAC", "APOS", "MEDIC", "DEFEITO", "CLIENTE"],
  ["ILUMINAC", "PUBLICA"],
  ["ILUMINAC", "PUBLICA", "DEFEITO"],
  ["ENCONTRADO", "NORMAL"],
  ["ENCONTRADO", "ENERGIA", "CORTADA"],
  ["ACESSO", "IMPEDIDO"],
  ["DISJUNTOR", "DESARMADO"],
  ["ENDERECO", "NAO", "LOCALIZADO"],
  ["PORTEIRA", "TRANCADA"],
  ["REDE", "TELEFON"],
  ["DISJUNTOR", "BT", "CLIENTE", "COM", "DEFEITO"],
  ["RAMAL", "ENTRADA", "DEFEITO", "CLIENTE"]
];

function normCausa(s) {
  if (!s) return '';
  let r = String(s).toUpperCase();
  // Remove acentos
  r = r.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Qualquer não-alfanumérico vira espaço
  r = r.replace(/[^A-Z0-9]+/g, ' ');
  return r.trim().replace(/\s+/g, ' ');
}

function isProcedente(causa) {
  const c = normCausa(causa);
  if (!c || c === '----') return false;

  // 1. Comparação direta normalizada
  if (CAUSAS_IMPROCEDENTES_NORM.some(imp => c === imp || c.includes(imp) || imp.includes(c))) {
    return false;
  }

  // 2. Fallback por palavras-chave (para casos com encoding corrompido)
  if (CAUSAS_KEYWORDS.some(keywords => keywords.every(kw => c.includes(kw)))) {
    return false;
  }

  return true;
}

function badgeProcedencia(causa) {
  return isProcedente(causa)
    ? `<span class="badge badge-procedente">✓ Procedente</span>`
    : `<span class="badge badge-improcedente">✗ Improcedente</span>`;
}
