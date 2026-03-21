// js/causas-improcedentes.js
// Lista centralizada de causas improcedentes — usada em todos os módulos

const CAUSAS_IMPROCEDENTES = [
  "ACESSO IMPEDIDO",
  "DISJUNTOR BT - CLIENTE DESARMADO",
  "DISJUNTOR MT –GRUPO A- DESARMADO",
  "DISJUNTOR MT - GRUPO A- DESARMADO",
  "ENCONTRADO ENERGIA CORTADA - CLIENTE",
  "ENCONTRADO ENERGIA CORTADA -  CLIENTE",
  "ENCONTRADO NORMAL - UC",
  "ENCONTRADO NORMAL -  UC",
  "ENDERECO NAO LOCALIZADO",
  "ENDEREÇO NAO LOCALIZADO",
  "ILUMINAÇAO PUBLICA COM DEFEITO",
  "ILUMINAÇAO PUBLICA  COM DEFEITO",
  "INSTALAÇÃO APÓS MEDIÇÃO COM DEFEITO - CLIENTE",
  "PORTEIRA TRANCADA",
  "REDE TELEFÔNICA/TV A CABO"
];

function isProcedente(causa) {
  if (!causa) return false;
  const c = causa.trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove acentos para comparar
  return !CAUSAS_IMPROCEDENTES.some(imp => {
    const i = imp.toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return c.includes(i) || i.includes(c);
  });
}

function badgeProcedencia(causa) {
  const proc = isProcedente(causa);
  return proc
    ? `<span class="badge badge-procedente">✓ Procedente</span>`
    : `<span class="badge badge-improcedente">✗ Improcedente</span>`;
}
