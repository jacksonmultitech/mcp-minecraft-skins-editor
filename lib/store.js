/**
 * @file store.js
 * Almacenamiento clave-valor para el relevo entre Claude y el editor.
 *
 * En Vercel se usa Upstash Redis mediante su API REST (sin librerías: solo
 * fetch). Si no hay credenciales (desarrollo local o pruebas), se usa un
 * almacén en memoria que imita los pocos comandos de Redis que necesitamos.
 *
 * Variables de entorno reconocidas (la integración de Vercel las crea solas):
 *   - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *   - KV_REST_API_URL + KV_REST_API_TOKEN
 *   - <PREFIJO>_REST_API_URL + <PREFIJO>_REST_API_TOKEN  (prefijo personalizado,
 *     por ejemplo STORAGE_REST_API_URL si al conectar se eligió "STORAGE")
 */

/** Busca en el entorno la URL y el token REST de Upstash. */
export function findUpstashCredentials(env = process.env) {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN, source: 'UPSTASH_REDIS_REST_*' };
  }
  const urlKey = Object.keys(env).find((k) => k.endsWith('_REST_API_URL') && env[k.replace(/_URL$/, '_TOKEN')]);
  if (urlKey) {
    return { url: env[urlKey], token: env[urlKey.replace(/_URL$/, '_TOKEN')], source: urlKey.replace(/_URL$/, '_*') };
  }
  return null;
}

/** Cliente mínimo de la API REST de Upstash. */
class UpstashStore {
  constructor({ url, token, source }) {
    this.url = url.replace(/\/$/, '');
    this.token = token;
    this.kind = 'upstash';
    this.source = source;
  }

  async _post(path, body) {
    const res = await fetch(`${this.url}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Upstash ${res.status}: ${data.error ?? res.statusText}`);
    return data;
  }

  /** Ejecuta un comando: store.cmd('SET', 'k', 'v', 'EX', 60) */
  async cmd(...args) {
    const data = await this._post('', args.map(String));
    if (data.error) throw new Error(`Upstash: ${data.error}`);
    return data.result;
  }

  /** Ejecuta varios comandos en una sola petición HTTP. */
  async pipeline(commands) {
    const data = await this._post('/pipeline', commands.map((c) => c.map(String)));
    return data.map((r) => {
      if (r.error) throw new Error(`Upstash: ${r.error}`);
      return r.result;
    });
  }
}

/**
 * Almacén en memoria con los comandos que usa el relevo:
 * GET, SET (EX, NX), DEL, EXISTS, EXPIRE, INCR, RPUSH, LPOP (con cantidad), PING.
 * Solo para desarrollo: en Vercel cada instancia tendría su propia memoria.
 */
export class MemoryStore {
  constructor() {
    this.kind = 'memory';
    this.source = 'memoria';
    this.data = new Map(); // clave → { value, expiresAt }
  }

  _get(key) {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  async cmd(name, ...args) {
    const op = String(name).toUpperCase();
    switch (op) {
      case 'PING': return 'PONG';
      case 'GET': return this._get(args[0])?.value ?? null;
      case 'SET': {
        const [key, value, ...opts] = args;
        const upper = opts.map((o) => String(o).toUpperCase());
        if (upper.includes('NX') && this._get(key)) return null;
        const exIndex = upper.indexOf('EX');
        const expiresAt = exIndex >= 0 ? Date.now() + Number(opts[exIndex + 1]) * 1000 : 0;
        this.data.set(key, { value: String(value), expiresAt });
        return 'OK';
      }
      case 'DEL': return args.reduce((n, k) => n + (this.data.delete(k) ? 1 : 0), 0);
      case 'EXISTS': return this._get(args[0]) ? 1 : 0;
      case 'EXPIRE': {
        const entry = this._get(args[0]);
        if (!entry) return 0;
        entry.expiresAt = Date.now() + Number(args[1]) * 1000;
        return 1;
      }
      case 'INCR': {
        const entry = this._get(args[0]);
        const value = Number(entry?.value ?? 0) + 1;
        this.data.set(args[0], { value: String(value), expiresAt: entry?.expiresAt ?? 0 });
        return value;
      }
      case 'RPUSH': {
        const [key, ...values] = args;
        const entry = this._get(key) ?? { value: [], expiresAt: 0 };
        entry.value.push(...values.map(String));
        this.data.set(key, entry);
        return entry.value.length;
      }
      case 'LPOP': {
        const entry = this._get(args[0]);
        if (!entry || entry.value.length === 0) return null;
        if (args[1] === undefined) return entry.value.shift();
        return entry.value.splice(0, Number(args[1]));
      }
      default:
        throw new Error(`Comando no soportado en memoria: ${op}`);
    }
  }

  async pipeline(commands) {
    const results = [];
    for (const c of commands) results.push(await this.cmd(...c));
    return results;
  }
}

let shared = null;

/** Devuelve el almacén de la aplicación (se crea una vez por instancia). */
export function getStore() {
  if (!shared) {
    const creds = findUpstashCredentials();
    shared = creds ? new UpstashStore(creds) : new MemoryStore();
  }
  return shared;
}

/** Permite inyectar un almacén (pruebas). */
export function setStore(store) {
  shared = store;
}
