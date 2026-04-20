// js/db-init.js — Cliente Turso (SQLite) com interface similar ao Supabase
// Configure com suas credenciais do Turso

const TURSO_URL   = 'https://retrabalho-flavioduarte27.aws-us-east-1.turso.io';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzY2OTYyMjUsImlkIjoiMDE5ZGFiNTYtNDcwMS03NjhjLThlMGQtZTgzOTQ5NzU1MDM5IiwicmlkIjoiOGFkOWI3ZGUtYWFmZS00OWY2LTg5YjctMDIzMDc5OWYwMTBhIn0.VNc1l-a5gmzNvo6U8aH1EJMs0ReWeE0APp0Bce2uS9ZxOWaQVUqqRQzQM7KfEIpUijZG8kuVR8uuAqCKiV-fCA';

// ============================================================
// CLIENTE HTTP DO TURSO
// ============================================================
const db = (() => {

  async function sql(query, args = []) {
    // Converte ? para :param0, :param1, etc.
    let q = query;
    args.forEach((_, i) => { q = q.replace('?', `:param${i}`); });

    const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${TURSO_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        requests: [
          { type: 'execute', stmt: { sql: q, named_args: args.map((v,i) => ({ name: `param${i}`, value: toTursoValue(v) })) } },
          { type: 'close' }
        ]
      })
    });

    if (!res.ok) throw new Error(`Turso HTTP ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const result = json.results?.[0];
    if (result?.type === 'error') throw new Error(result.error?.message || 'Erro Turso');
    return parseResult(result?.response?.result);
  }

  function toTursoValue(v) {
    if (v === null || v === undefined) return { type: 'null' };
    if (typeof v === 'number' && Number.isInteger(v)) return { type: 'integer', value: String(v) };
    if (typeof v === 'number') return { type: 'float', value: String(v) };
    if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' };
    return { type: 'text', value: String(v) };
  }

  function parseResult(result) {
    if (!result) return [];
    const cols = result.cols?.map(c => c.name) || [];
    return (result.rows || []).map(row =>
      Object.fromEntries(cols.map((col, i) => [col, parseTursoVal(row[i])]))
    );
  }

  function parseTursoVal(v) {
    if (!v || v.type === 'null') return null;
    if (v.type === 'integer') return parseInt(v.value);
    if (v.type === 'float')   return parseFloat(v.value);
    return v.value ?? null;
  }

  // ============================================================
  // INTERFACE COMPATÍVEL COM O CÓDIGO EXISTENTE
  // ============================================================

  // Classe para query builder
  class Query {
    constructor(table) {
      this._table = table;
      this._wheres = [];
      this._args   = [];
      this._cols   = '*';
      this._limit  = null;
      this._order  = null;
      this._ascending = true;
    }

    select(cols = '*') { this._cols = cols === '*' ? '*' : cols; return this; }

    eq(col, val) {
      this._wheres.push(`${col} = ?`);
      this._args.push(val);
      return this;
    }

    neq(col, val) {
      this._wheres.push(`${col} != ?`);
      this._args.push(val);
      return this;
    }

    in(col, vals) {
      if (!vals || !vals.length) { this._wheres.push('1=0'); return this; }
      this._wheres.push(`${col} IN (${vals.map(()=>'?').join(',')})`);
      this._args.push(...vals);
      return this;
    }

    gte(col, val) {
      this._wheres.push(`${col} >= ?`);
      this._args.push(val);
      return this;
    }

    order(col, { ascending = true } = {}) {
      this._order = col;
      this._ascending = ascending;
      return this;
    }

    limit(n) { this._limit = n; return this; }

    range(from, to) {
      this._limit  = to - from + 1;
      this._offset = from;
      return this;
    }

    async get() {
      const where  = this._wheres.length ? `WHERE ${this._wheres.join(' AND ')}` : '';
      const order  = this._order ? `ORDER BY ${this._order} ${this._ascending?'ASC':'DESC'}` : '';
      const limit  = this._limit ? `LIMIT ${this._limit}` : '';
      const offset = this._offset ? `OFFSET ${this._offset}` : '';
      const query  = `SELECT ${this._cols} FROM ${this._table} ${where} ${order} ${limit} ${offset}`.trim();
      const data   = await sql(query, this._args);

      // Desserializa campos JSON
      return { data: data.map(deserializeRow), error: null };
    }

    async maybeSingle() {
      this._limit = 1;
      const { data } = await this.get();
      return { data: data[0] || null, error: null };
    }
  }

  // Serializa/desserializa campos JSON (historico JSONB → TEXT)
  const JSON_FIELDS = ['historico'];
  function serializeRow(row) {
    const r = { ...row };
    for (const f of JSON_FIELDS) {
      if (r[f] !== undefined && typeof r[f] !== 'string') r[f] = JSON.stringify(r[f]);
    }
    // Booleanos → 0/1
    for (const k of Object.keys(r)) {
      if (typeof r[k] === 'boolean') r[k] = r[k] ? 1 : 0;
    }
    return r;
  }
  function deserializeRow(row) {
    const r = { ...row };
    for (const f of JSON_FIELDS) {
      if (typeof r[f] === 'string') {
        try { r[f] = JSON.parse(r[f]); } catch { r[f] = []; }
      }
    }
    // 0/1 → boolean para campos conhecidos
    const BOOL_FIELDS = ['em_historico','finalizado','ativo','procedente'];
    for (const f of BOOL_FIELDS) {
      if (r[f] !== undefined && r[f] !== null) r[f] = r[f] === 1 || r[f] === true;
    }
    return r;
  }

  // Converte ? para :paramN e monta named_args
  function buildStmt(query, args) {
    let q = query;
    const named = args.map((v, i) => {
      q = q.replace('?', `:param${i}`);
      return { name: `param${i}`, value: toTursoValue(v) };
    });
    return { sql: q, named_args: named };
  }

  // Upsert em lotes — envia N rows por requisição HTTP (pipeline)
  async function upsertRows(table, rows, chunkSize = 200) {
    if (!rows.length) return { error: null };
    const first = serializeRow(rows[0]);
    const cols  = Object.keys(first);
    const placeholders = cols.map(() => '?').join(', ');
    const query = `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const requests = chunk.map(row => {
        const r    = serializeRow(row);
        const args = cols.map(c => r[c] ?? null);
        return { type: 'execute', stmt: buildStmt(query, args) };
      });
      requests.push({ type: 'close' });

      const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests })
      });
      if (!res.ok) throw new Error(`Turso batch HTTP ${res.status}`);
      const json = await res.json();
      const erros = (json.results || []).filter(r => r.type === 'error');
      if (erros.length) throw new Error(`Turso batch erro: ${erros[0].error?.message}`);
    }
    return { error: null };
  }

  // Insert único (usa upsertRows com 1 row)
  async function insertRow(table, row) {
    return upsertRows(table, [row], 1);
  }

  // Delete
  async function deleteRows(table, wheres = [], args = []) {
    const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
    await sql(`DELETE FROM ${table} ${where}`, args);
    return { error: null };
  }

  // Count
  async function countRows(table) {
    const rows = await sql(`SELECT COUNT(*) as n FROM ${table}`);
    return rows[0]?.n ?? 0;
  }

  // Interface pública — imita o Supabase client
  return {
    sql,

    from(table) {
      return {
        // SELECT
        select(cols) { return new Query(table).select(cols); },

        // UPSERT (INSERT OR REPLACE)
        async upsert(rowOrRows, opts = {}) {
          const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
          return upsertRows(table, rows);
        },

        // INSERT
        async insert(rowOrRows) {
          const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
          for (const row of rows) await insertRow(table, row);
          return { error: null };
        },

        // DELETE com encadeamento
        delete() {
          const q = { _wheres: [], _args: [] };
          const chain = {
            eq(col, val)  { q._wheres.push(`${col} = ?`);  q._args.push(val); return chain; },
            neq(col, val) { q._wheres.push(`${col} != ?`); q._args.push(val); return chain; },
            async then(resolve) {
              const r = await deleteRows(table, q._wheres, q._args);
              resolve(r);
            },
            // Para Promise.all
            [Symbol.toStringTag]: 'Promise',
          };
          // Torna chain thenable
          chain.then = function(resolve, reject) {
            return deleteRows(table, q._wheres, q._args).then(resolve, reject);
          };
          return chain;
        },

        // Count
        async count() {
          return countRows(table);
        }
      };
    }
  };
})();
