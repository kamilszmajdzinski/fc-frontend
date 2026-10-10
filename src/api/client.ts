import type { ApiError, ErrorCode, RecipeRef, ValidationIssue } from './types';

const BASE_URL = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');

type Details = NonNullable<ApiError['error']['details']>;

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'NETWORK_ERROR';
  readonly details?: Details;

  constructor(status: number, code: ErrorCode | 'NETWORK_ERROR', message: string, details?: Details) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get issues(): ValidationIssue[] {
    return this.details && 'issues' in this.details ? this.details.issues : [];
  }

  get recipes(): RecipeRef[] {
    return this.details && 'recipes' in this.details ? this.details.recipes : [];
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(BASE_URL + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Nie można połączyć się z serwerem.');
  }

  if (response.status === 204) return undefined as T;

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as ApiError | null)?.error;
    throw new ApiRequestError(
      response.status,
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? `Błąd serwera (${response.status}).`,
      error?.details,
    );
  }
  return data as T;
}

/**
 * A message that can be shown to the user. Errors with their own UI (in-use, unit conflict)
 * are handled where they happen; this covers the rest.
 */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return 'Coś poszło nie tak. Spróbuj ponownie.';
  switch (error.code) {
    case 'NETWORK_ERROR':
      return 'Nie można połączyć się z serwerem. Sprawdź, czy backend działa.';
    case 'NOT_FOUND':
      return 'Nie znaleziono — mogło zostać usunięte.';
    case 'VALIDATION_ERROR':
      return error.issues.length > 0
        ? `Nie udało się zapisać: ${error.issues.map((issue) => issue.message).join('; ')}`
        : 'Nie udało się zapisać — sprawdź formularz.';
    case 'INTERNAL_ERROR':
      return 'Błąd serwera. Spróbuj ponownie za chwilę.';
    default:
      return error.message;
  }
}
