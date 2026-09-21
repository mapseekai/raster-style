export type ErrorCode =
  | 'E_QUERY_SYNTAX'
  | 'E_UNKNOWN_PARAMETER'
  | 'E_DUPLICATE_PARAMETER'
  | 'E_JSON'
  | 'E_SCHEMA'
  | 'E_SEMANTIC'
  | 'E_LIMIT'
  | 'E_CONFIG';

/** A stable machine-readable code, with an optional document path or query key. */
export class RasterStyleError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly path = '',
  ) {
    super(message);
    this.name = 'RasterStyleError';
  }
}

export function fail(code: ErrorCode, message: string, path = ''): never {
  throw new RasterStyleError(code, message, path);
}
