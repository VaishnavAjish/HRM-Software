import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { AuthService } from '../auth/auth.service.js';
import { authenticated } from '../auth/guards.js';
import { AuditLogger } from '../../lib/audit/audit-logger.js';
import { ResourceError } from '../masters/masters.service.js';
import { EmployeeService, type Actor } from './employees.service.js';
import { PrismaEmployeeRepository } from './employees.repository.js';
import { EmployeeImportService, IMPORT_COLUMNS } from './import.service.js';
import { PrismaImportRepository } from './import.repository.js';
import { XlsxSheetReader, toKeyedRows } from '../../lib/excel/sheet-reader.js';
import { make as hashPassword } from '../../lib/laravel/hash.js';

/**
 * Employee routes, path-for-path with Laravel.
 *
 *   GET  /api/employee/get            GET  /api/employee/show/:id
 *   POST /api/employee/store          PUT  /api/employee/edit/:id
 *   GET  /api/employee/delete/:id     POST /api/employee/delete-multiple
 *
 * The delete-by-GET is inherited, not chosen. A GET is meant to be safe, so
 * anything that follows links — a crawler, a prefetcher, a browser's
 * speculative preload — can destroy an employee record by visiting a URL. It
 * is reproduced because the React client calls it and changing the verb would
 * break the page; a DELETE alias is registered alongside so the client can be
 * moved over without a flag day.
 */

export interface EmployeeRouteDeps {
  authService: AuthService;
  audit: AuditLogger;
  employees?: EmployeeService;
  imports?: EmployeeImportService;
}

async function respond(reply: FastifyReply, run: () => Promise<unknown>): Promise<unknown> {
  try {
    return reply.send(await run());
  } catch (error) {
    if (error instanceof ResourceError) {
      return reply.status(error.statusCode).send({ status: false, message: error.message });
    }
    throw error;
  }
}

function idOf(request: FastifyRequest<{ Params: { id: string } }>): number {
  const id = Number.parseInt(request.params.id, 10);
  if (Number.isNaN(id)) throw new ResourceError('Employee not found', 404);
  return id;
}

const actorOf = (request: FastifyRequest): Actor => request.authUser as unknown as Actor;

export async function registerEmployeeRoutes(
  app: FastifyInstance,
  deps: EmployeeRouteDeps,
): Promise<void> {
  const employees = deps.employees ?? new EmployeeService(new PrismaEmployeeRepository());
  const guard = { preHandler: authenticated(deps.authService, ['admin']) };

  const importer =
    deps.imports ??
    new EmployeeImportService(new PrismaImportRepository(), { make: (p) => hashPassword(p) });
  const sheetReader = new XlsxSheetReader();

  /**
   * Read either input shape.
   *
   * The upload page posts a parsed `rows` array once the user has confirmed
   * the column mapping; the plain path posts the file itself with an optional
   * mapping. Both reach the same loop.
   */
  const readRows = async (
    request: FastifyRequest,
  ): Promise<{ rows: Record<string, unknown>[]; fileName: string; fields: Record<string, string> }> => {
    const fields: Record<string, string> = {};

    if (typeof request.isMultipart === 'function' && request.isMultipart()) {
      let contents: Buffer | null = null;
      let fileName = '';

      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname === 'file') {
            contents = await part.toBuffer();
            fileName = part.filename;
          } else {
            await part.toBuffer();
          }
        } else {
          fields[part.fieldname] = String(part.value ?? '');
        }
      }

      if (!contents) throw new ResourceError('The file field is required.', 422);

      let mapping: Record<string, string> | null = null;
      if (fields.mapping) {
        try {
          mapping = JSON.parse(fields.mapping) as Record<string, string>;
        } catch {
          throw new ResourceError('The column mapping is not valid JSON.', 422);
        }
      }

      return { rows: toKeyedRows(sheetReader.read(contents), mapping), fileName, fields };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    Object.entries(body).forEach(([k, v]) => {
      if (typeof v === 'string') fields[k] = v;
    });

    let rows = body.rows;
    if (typeof rows === 'string') {
      try {
        rows = JSON.parse(rows);
      } catch {
        rows = [];
      }
    }
    if (!Array.isArray(rows)) rows = [];

    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);

    return {
      rows: rows as Record<string, unknown>[],
      fileName: `json-import-${stamp}.json`,
      fields,
    };
  };

  // ---- GET /api/employee/import-columns ---------------------------------

  app.get('/api/employee/import-columns', guard, async (_request, reply) =>
    reply.send({ status: true, data: IMPORT_COLUMNS }),
  );

  // ---- POST /api/employee/import ----------------------------------------

  app.post('/api/employee/import', guard, async (request, reply) =>
    respond(reply, async () => {
      const { rows, fileName, fields } = await readRows(request);

      const result = await importer.import(actorOf(request), {
        rows,
        fileName,
        companyCode: fields.company_code || null,
        unit: fields.unit || null,
        batchId: fields.batch_id ? Number.parseInt(fields.batch_id, 10) || null : null,
      });

      await deps.audit.log(request, 'IMPORT', 'Employee', null, {
        imported: result.imported,
        skipped: result.skipped.length,
        batch_id: result.batchId,
      });

      let message = `${result.imported} employees imported`;
      if (result.skipped.length > 0) {
        message += `; ${result.skipped.length} row(s) skipped`;
      }

      return {
        status: true,
        message,
        imported: result.imported,
        skipped: result.skipped,
        batch_id: result.batchId,
      };
    }),
  );

  // ---- POST /api/employee/import-account-detail -------------------------

  app.post('/api/employee/import-account-detail', guard, async (request, reply) =>
    respond(reply, async () => {
      const { rows } = await readRows(request);
      const result = await importer.importAccountDetails(actorOf(request), rows);

      await deps.audit.log(request, 'IMPORT', 'EmployeeBankDetails', null, result);

      return { status: true, message: `${result.imported} account details imported` };
    }),
  );

  // ---- GET /api/appointment/check-emp-code -------------------------------

  /**
   * "Is this employee code already taken?", asked before the form commits
   * rather than after a failed submit. exclude_id skips the record's own row
   * when re-checking a code already assigned to itself.
   *
   * Unscoped, as in PHP: the answer must be true across companies, because the
   * code the caller is about to set has to be unique wherever it lands. Only
   * id, name and company_code are returned — the same three PHP exposes.
   */
  app.get('/api/appointment/check-emp-code', guard, async (request, reply) =>
    respond(reply, async () => {
      const q = (request.query ?? {}) as { emp_code?: string; exclude_id?: string };
      const empCode = (q.emp_code ?? '').trim();

      if (empCode === '') return { status: true, exists: false };

      const excludeId = q.exclude_id ? Number.parseInt(q.exclude_id, 10) : NaN;
      const found = await employees.findByEmpCode(
        empCode,
        Number.isNaN(excludeId) ? undefined : excludeId,
      );

      if (!found) return { status: true, exists: false };

      return {
        status: true,
        exists: true,
        employee: { id: found.id, name: found.name, company_code: found.company_code },
      };
    }),
  );

  // ---- GET /api/employee/get ---------------------------------------------

  app.get('/api/employee/get', guard, async (request, reply) =>
    respond(reply, async () => {
      const q = (request.query ?? {}) as Record<string, string | undefined>;

      const { result, disclosed } = await employees.list(actorOf(request), {
        status: q.status ?? null,
        companyCode: q.company_code ?? null,
        unit: q.unit ?? null,
        search: q.search ?? null,
        page: Math.max(1, Number.parseInt(q.page ?? '1', 10) || 1),
        perPage: Math.min(200, Math.max(1, Number.parseInt(q.limit ?? '15', 10) || 15)),
      });

      // One audit entry per request carrying a count, never one per row and
      // never the numbers themselves.
      if (disclosed > 0) {
        await deps.audit.log(request, 'READ', 'EMPLOYEE_LIST_FULL_AADHAAR_DISCLOSED', null, {
          disclosed_count: disclosed,
          page: result.currentPage,
        });
      }

      return {
        status: true,
        data: {
          users: {
            data: result.rows,
            total: result.total,
            per_page: result.perPage,
            current_page: result.currentPage,
            last_page: result.lastPage,
          },
          active_users: result.activeCount,
          inactive_users: result.total - result.activeCount,
        },
      };
    }),
  );

  // ---- GET /api/employee/show/:id ----------------------------------------

  app.get<{ Params: { id: string } }>('/api/employee/show/:id', guard, async (request, reply) =>
    respond(reply, async () => {
      const data = await employees.show(actorOf(request), idOf(request));

      if (data.aadhaar_full) {
        await deps.audit.log(request, 'READ', 'EMPLOYEE_FULL_AADHAAR_VIEWED', null, {
          employee_id: data.id,
        });
      }

      return { status: true, data };
    }),
  );

  // ---- POST /api/employee/store ------------------------------------------

  app.post('/api/employee/store', guard, async (request, reply) =>
    respond(reply, async () => {
      const employee = await employees.create(
        actorOf(request),
        (request.body ?? {}) as Record<string, unknown>,
      );
      await deps.audit.log(request, 'CREATE', 'Employee', null, { id: employee.id });

      return { status: true, message: 'Employee created', data: employee };
    }),
  );

  // ---- PUT /api/employee/edit/:id ----------------------------------------

  app.put<{ Params: { id: string } }>('/api/employee/edit/:id', guard, async (request, reply) =>
    respond(reply, async () => {
      const id = idOf(request);
      const employee = await employees.update(
        actorOf(request),
        id,
        (request.body ?? {}) as Record<string, unknown>,
      );
      await deps.audit.log(request, 'UPDATE', 'Employee', { id }, { id });

      return { status: true, message: 'Employee updated', data: employee };
    }),
  );

  // ---- delete ------------------------------------------------------------

  const destroy = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) =>
    respond(reply, async () => {
      const id = idOf(request);
      await employees.remove(actorOf(request), id);
      await deps.audit.log(request, 'DELETE', 'Employee', { id }, null);

      return { status: true, message: 'Employee deleted' };
    });

  // The verb the client uses today...
  app.get<{ Params: { id: string } }>('/api/employee/delete/:id', guard, destroy);
  // ...and the one it should use, available now so the switch is a one-line
  // client change rather than a coordinated release.
  app.delete<{ Params: { id: string } }>('/api/employee/delete/:id', guard, destroy);

  app.post('/api/employee/delete-multiple', guard, async (request, reply) =>
    respond(reply, async () => {
      const body = (request.body ?? {}) as { ids?: unknown };
      const ids = Array.isArray(body.ids)
        ? body.ids.map((v) => Number.parseInt(String(v), 10)).filter((n) => !Number.isNaN(n))
        : [];

      if (ids.length === 0) {
        // PHP answers 400 here, not 422.
        throw new ResourceError('No IDs provided', 400);
      }

      const deleted = await employees.removeMany(actorOf(request), ids);
      await deps.audit.log(request, 'DELETE', 'Employee', { ids }, { deleted });

      return { status: true, message: `${deleted} employees deleted` };
    }),
  );
}
