import { cookies } from 'next/headers';
import { api } from './api';

export async function serverApi<T>(path: string) {
  const cookieHeader = (await cookies()).toString();
  return api<T>(path, {
    cache: 'no-store',
    headers: cookieHeader ? { Cookie: cookieHeader } : {}
  });
}
