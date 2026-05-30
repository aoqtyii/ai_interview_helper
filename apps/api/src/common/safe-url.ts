import { lookup } from 'node:dns/promises';
import { BadRequestException } from '@nestjs/common';

export async function assertSafeHttpUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Invalid URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new BadRequestException('Only HTTP and HTTPS feed URLs are allowed');
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new BadRequestException('Localhost feed URLs are not allowed');
  }

  if (isBlockedAddress(hostname)) {
    throw new BadRequestException('Private or local feed URLs are not allowed');
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: false });
  } catch {
    throw new BadRequestException('Feed host could not be resolved');
  }

  if (addresses.some((entry) => isBlockedAddress(entry.address))) {
    throw new BadRequestException('Feed host resolves to a private or local address');
  }

  return url.toString();
}

function isBlockedAddress(value: string) {
  if (value.includes(':')) return isBlockedIpv6(value);
  return isBlockedIpv4(value);
}

function isBlockedIpv4(value: string) {
  const parts = value.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const a = parts[0]!;
  const b = parts[1]!;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isBlockedIpv6(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.')
  );
}
