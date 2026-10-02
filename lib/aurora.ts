import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
  type ExecuteStatementCommandOutput,
  type Field,
  type SqlParameter,
} from '@aws-sdk/client-rds-data'
import { neon as neonDriver } from '@neondatabase/serverless'

/**
 * aurora.ts — the app's Postgres client over the RDS Data API (2026-10-01).
 *
 * The app runs outside any VPC and its Aurora cluster has no public endpoint,
 * so the only road to it is the Data API: an HTTPS call signed with the role
 * the app runs under, no connection pool, no stored database password. This
 * client wears the shape of the Neon HTTP driver the app was written against
 * (the tagged template, `.query(text, params)`, `.transaction(...)`), and
 * `neon()` at the foot of the file is a drop-in for the driver's own, so the
 * call sites do not change. 44B's src/lib/db-data-api.ts is the precedent.
 *
 * Three things the driver did not have to think about:
 *  - a paused cluster answers its first statements with
 *    DatabaseResumingException while it wakes; they are retried;
 *  - one response is capped at 1 MB; a read that trips the cap is fetched in
 *    pages instead;
 *  - one statement is cut off at 45 seconds.
 *
 * Laziness matters: like Neon's, a statement built by the template does not
 * run until it is awaited, which is what lets `transaction([sql\`…\`, sql\`…\`])`
 * collect its statements and run them in one transaction.
 */

// `any`, as the Neon driver types its rows, so call sites read columns as before.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>

/** A raw SQL fragment, inlined as written — column lists, never user input. */
export class Unsafe {
  constructor(readonly text: string) {}
}

/**
 * A statement that runs when it is first awaited, not when it is built — a
 * real Promise, so `Promise.all([...])` and every `Promise<T[]>` annotation at
 * the call sites hold, but one whose work starts on the first `then`. Chained
 * promises are plain Promises (the species), never another LazyQuery.
 */
export class LazyQuery extends Promise<Row[]> {
  static get [Symbol.species]() {
    return Promise
  }
  private started = false
  private readonly settle: { resolve: (rows: Row[]) => void; reject: (error: unknown) => void }

  constructor(
    private readonly runner: () => Promise<Row[]>,
    readonly text: string,
    readonly values: unknown[],
    /** The bound parameters, kept so a transaction can run the statement as built. */
    readonly parameters: SqlParameter[],
  ) {
    let resolve!: (rows: Row[]) => void
    let reject!: (error: unknown) => void
    super((res, rej) => {
      resolve = res
      reject = rej
    })
    this.settle = { resolve, reject }
  }

  override then<R1 = Row[], R2 = never>(
    onfulfilled?: ((value: Row[]) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    if (!this.started) {
      this.started = true
      this.runner().then(this.settle.resolve, this.settle.reject)
    }
    return super.then(onfulfilled, onrejected)
  }
}

export interface SqlClient {
  (strings: TemplateStringsArray, ...values: unknown[]): LazyQuery
  /** `$1`-style placeholders, the way `pg` and Neon take them. */
  query(text: string, params?: unknown[]): LazyQuery
  transaction(queries: LazyQuery[] | ((t: SqlClient) => LazyQuery[])): Promise<Row[][]>
  unsafe(text: string): Unsafe
}

export type DataApiConfig = { resourceArn: string; secretArn: string; database: string; region?: string }

/* ------------------------------------------------------------ values */

// How a value reaches the statement. The Neon driver sends every parameter
// untyped and lets Postgres infer its type from the column beside it. The
// Data API cannot: a bound string arrives as varchar, and a varchar is refused
// by a uuid, enum, timestamp, integer or jsonb column. So values are written
// into the statement as quoted, untyped literals, which Postgres infers exactly
// as it did the driver's parameters. Quoting is the standard one (the server
// runs with standard_conforming_strings on): a quote is doubled, nothing else
// is special, and a NUL cannot be stored and is dropped. Only a very long
// string is bound instead, to stay under the Data API's statement size limit;
// such a value is document text bound for a text column.
const BIND_OVER = 30_000

const quote = (text: string): string => `'${text.replace(/\0/g, '').replace(/'/g, "''")}'`

// A Postgres array literal: the Data API has no array parameter.
function arrayLiteral(values: unknown[]): string {
  const items = values.map((v) => {
    if (v === null || v === undefined) return 'NULL'
    if (typeof v === 'number' || typeof v === 'bigint') return String(v)
    if (typeof v === 'boolean') return v ? 't' : 'f'
    return `"${String(v).replace(/(["\\])/g, '\\$1')}"`
  })
  return quote(`{${items.join(',')}}`)
}

const isScalarArray = (value: unknown): value is unknown[] =>
  Array.isArray(value) && !(value.length && typeof value[0] === 'object' && value[0] !== null)

/** The untyped literal for a value, or null when it must be bound instead. */
function literal(value: unknown): string | null {
  if (value === null || value === undefined) return 'NULL'
  if (value instanceof Date) return quote(value.toISOString())
  if (isScalarArray(value)) return arrayLiteral(value)
  switch (typeof value) {
    case 'number':
    case 'bigint':
      return quote(String(value))
    case 'boolean':
      return value ? "'true'" : "'false'"
    case 'object':
      return quote(JSON.stringify(value))
    default: {
      const text = String(value)
      return text.length > BIND_OVER ? null : quote(text)
    }
  }
}

const bound = (name: string, value: unknown): SqlParameter => ({ name, value: { stringValue: String(value).replace(/\0/g, '') } })

/** The statement and its bound parameters, from a template's parts and values. */
function fromTemplate(strings: readonly string[], values: unknown[]): { text: string; parameters: SqlParameter[] } {
  let text = ''
  const parameters: SqlParameter[] = []
  strings.forEach((part, i) => {
    text += part
    if (i >= values.length) return
    const value = values[i]
    if (value instanceof Unsafe) text += value.text
    else if (value instanceof LazyQuery) {
      // A statement composed into another, the way the Neon driver allows:
      // its text goes in, its parameters renumbered behind the ones so far.
      const base = parameters.length
      text += value.text.replace(/:zqp(\d+)\b/g, (_, n: string) => `:zqp${base + Number(n)}`)
      value.parameters.forEach((p, k) => parameters.push({ ...p, name: `zqp${base + k}` }))
    } else {
      const inline = literal(value)
      if (inline !== null) text += inline
      else {
        const name = `zqp${parameters.length}`
        parameters.push(bound(name, value))
        text += `:${name}`
      }
    }
  })
  return { text, parameters }
}

/** `$1 … $n` placeholders, each replaced by its value's literal (or a bound name). */
function fromPositional(text: string, params: unknown[]): { text: string; parameters: SqlParameter[] } {
  const parameters: SqlParameter[] = []
  const replacement = params.map((value) => {
    const inline = literal(value)
    if (inline !== null) return inline
    const name = `zqp${parameters.length}`
    parameters.push(bound(name, value))
    return `:${name}`
  })
  const rewritten = text.replace(/\$(\d+)/g, (whole, n: string) => replacement[Number(n) - 1] ?? whole)
  return { text: rewritten, parameters }
}

/* ------------------------------------------------------------ rows */

const TIMESTAMP = /^timestamp/
const DATE = /^date$/
const JSONISH = /^jsonb?$/
const BIGISH = /^(int8|bigserial|numeric)$/

// One Data API field → one JS value, decoded against the column type so the
// rows look like the Neon driver's: timestamps as Dates, jsonb parsed.
function decode(field: Field, typeName: string | undefined): unknown {
  const f = field as unknown as Record<string, unknown>
  if (f.isNull) return null
  if (f.arrayValue) {
    const inner = Object.values(f.arrayValue as Record<string, unknown>)[0]
    return Array.isArray(inner) ? inner : []
  }
  const value = (f.stringValue ?? f.longValue ?? f.doubleValue ?? f.booleanValue ?? f.blobValue ?? null) as unknown
  const type = (typeName ?? '').toLowerCase()
  // The Neon driver hands back bigint and numeric as strings; so does this.
  if (BIGISH.test(type) && (typeof value === 'number' || typeof value === 'string')) return String(value)
  if (typeof value === 'string') {
    if (JSONISH.test(type)) {
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    }
    // As the Neon driver reads them: a timestamptz is an instant (the Data API
    // sends it in UTC), while a zoneless timestamp and a date are read in the
    // process's own zone, which on the server is UTC.
    if (type === 'timestamptz') return new Date(value.replace(' ', 'T') + (/[zZ]|[+-]\d\d(:?\d\d)?$/.test(value) ? '' : 'Z'))
    if (TIMESTAMP.test(type)) return new Date(value.replace(' ', 'T'))
    if (DATE.test(type)) return new Date(`${value}T00:00:00`)
  }
  return value
}

function rowsOf(response: ExecuteStatementCommandOutput): Row[] {
  const columns = response.columnMetadata ?? []
  return (response.records ?? []).map((record) => {
    const row: Row = {}
    record.forEach((field, i) => {
      const column = columns[i]
      row[column?.label ?? column?.name ?? `column${i}`] = decode(field, column?.typeName)
    })
    return row
  })
}

/* ------------------------------------------------------------ client */

export function dataApi(config: DataApiConfig): SqlClient {
  const client = new RDSDataClient({ region: config.region ?? process.env.AWS_REGION ?? 'us-east-1' })

  // A paused cluster takes ten to twenty seconds to wake and refuses statements
  // until it has. Waiting here is what makes the first click after a quiet
  // spell slow instead of broken.
  const awake = async <T>(call: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await call()
      } catch (error) {
        const e = error as { name?: string; message?: string }
        const resuming = e.name === 'DatabaseResumingException' || /resuming after being auto-paused/i.test(e.message ?? '')
        if (!resuming || attempt >= 14) throw error
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }
  }

  const once = async (text: string, parameters: SqlParameter[], transactionId?: string): Promise<Row[]> => {
    const response = await awake(() =>
      client.send(
        new ExecuteStatementCommand({
          resourceArn: config.resourceArn,
          secretArn: config.secretArn,
          database: config.database,
          sql: text,
          parameters: parameters.length ? parameters : undefined,
          includeResultMetadata: true,
          ...(transactionId ? { transactionId } : {}),
        }),
      ),
    )
    return rowsOf(response)
  }

  // One response is capped at 1 MB. A read that trips the cap is fetched again
  // in pages, each a slice of the same statement, halving the page until a
  // slice fits. Only a bare read is paged; anything else reports the error.
  const execute = async (text: string, parameters: SqlParameter[], transactionId?: string): Promise<Row[]> => {
    try {
      return await once(text, parameters, transactionId)
    } catch (error) {
      const message = (error as { message?: string }).message ?? ''
      const tooBig = /response size limit|more than the allowed response size/i.test(message)
      const statement = text.trim().replace(/;\s*$/, '')
      if (!tooBig || !/^(select|with)\b/i.test(statement)) throw error
      const rows: Row[] = []
      let size = 2000
      for (let offset = 0; ; ) {
        let page: Row[]
        try {
          page = await once(`SELECT * FROM (${statement}) AS paged LIMIT ${size} OFFSET ${offset}`, parameters, transactionId)
        } catch (inner) {
          if (size > 1 && /response size limit|more than the allowed response size/i.test((inner as { message?: string }).message ?? '')) {
            size = Math.max(1, Math.floor(size / 2))
            continue
          }
          throw inner
        }
        rows.push(...page)
        if (page.length < size) return rows
        offset += size
      }
    }
  }

  const lazy = (text: string, parameters: SqlParameter[], values: unknown[]): LazyQuery =>
    new LazyQuery(() => execute(text, parameters), text, values, parameters)

  const make = (): SqlClient => {
    const tag = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const { text, parameters } = fromTemplate(strings, values)
      return lazy(text, parameters, values)
    }) as SqlClient
    tag.query = (text: string, params: unknown[] = []) => {
      const built = fromPositional(text, params)
      return lazy(built.text, built.parameters, params)
    }
    tag.unsafe = (text: string) => new Unsafe(text)
    tag.transaction = async (queries) => {
      const list = typeof queries === 'function' ? queries(make()) : queries
      const begun = await awake(() =>
        client.send(
          new BeginTransactionCommand({ resourceArn: config.resourceArn, secretArn: config.secretArn, database: config.database }),
        ),
      )
      const transactionId = begun.transactionId
      const results: Row[][] = []
      try {
        // The lazy statements were never started on their own; each runs here,
        // as built, inside the one transaction.
        for (const q of list) results.push(await execute(q.text, q.parameters, transactionId))
        await client.send(new CommitTransactionCommand({ resourceArn: config.resourceArn, secretArn: config.secretArn, transactionId }))
      } catch (error) {
        await client.send(new RollbackTransactionCommand({ resourceArn: config.resourceArn, secretArn: config.secretArn, transactionId })).catch(() => {})
        throw error
      }
      return results
    }
    return tag
  }

  return make()
}

/* ------------------------------------------------------------ drop-in */

/** The Neon driver's client type, for the call sites that name it. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type NeonQueryFunction<ArrayMode = false, FullResults = false> = SqlClient

/** True when this deployment's database is the Aurora cluster. */
export function usesAurora(prefix = 'AURORA'): boolean {
  return Boolean(process.env[`${prefix}_CLUSTER_ARN`] && process.env[`${prefix}_SECRET_ARN`])
}

/** The Aurora client for the cluster named by `<prefix>_CLUSTER_ARN`, `_SECRET_ARN` and `_DATABASE`. */
export function aurora(prefix = 'AURORA'): SqlClient {
  return dataApi({
    resourceArn: process.env[`${prefix}_CLUSTER_ARN`]!,
    secretArn: process.env[`${prefix}_SECRET_ARN`]!,
    database: process.env[`${prefix}_DATABASE`] ?? 'postgres',
  })
}

/**
 * Stands where `neon(connectionString)` from the Neon driver stood. On AWS the
 * connection string is ignored: the cluster comes from the environment and the
 * role the app runs under is the credential. Where no cluster is named (a
 * laptop), the Neon driver serves the connection string as it always has.
 */
export function neon(connectionString?: string, options?: unknown): SqlClient {
  if (usesAurora()) return aurora()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return neonDriver(connectionString as string, options as any) as unknown as SqlClient
}
