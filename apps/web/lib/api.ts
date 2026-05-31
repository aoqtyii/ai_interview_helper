const API_BASE_URL = process.env.WEB_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string
  ) {
    super(message);
  }
}

type ApiErrorResponse = {
  message?: string | string[];
  requestId?: string;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const error = await readError(response);
    const message = Array.isArray(error.message) ? error.message.join('; ') : error.message;
    throw new ApiError(message ?? `API ${path} failed with ${response.status}`, response.status, error.requestId);
  }

  return response.json() as Promise<T>;
}

async function readError(response: Response): Promise<ApiErrorResponse> {
  try {
    return (await response.json()) as ApiErrorResponse;
  } catch {
    return {};
  }
}
