/**
 * Errors shared across modules.
 *
 * ResourceError used to live in modules/masters/masters.service.ts, which was
 * the Node port of the Locations/Branches/Teams/Approval Levels CRUD. Eleven
 * unrelated modules imported the error class from there, so when that module
 * was removed with the Access Control console the class moved here rather than
 * keeping a service file alive purely to host it.
 */

export class ResourceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ResourceError';
  }
}
