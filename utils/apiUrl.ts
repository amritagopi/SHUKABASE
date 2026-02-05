const DEFAULT_API_BASE_URL = 'http://localhost:5000/api';
const DEFAULT_BACKEND_ORIGIN = 'http://localhost:5000';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const resolveApiBaseUrl = (backendUrl?: string): string => {
  if (!backendUrl) return DEFAULT_API_BASE_URL;

  try {
    const url = new URL(backendUrl);
    let path = trimTrailingSlash(url.pathname);
    if (path.endsWith('/api/search')) {
      path = path.replace(/\/api\/search$/, '/api');
    } else if (path.endsWith('/search')) {
      path = path.replace(/\/search$/, '');
    }
    return `${url.origin}${path || ''}`;
  } catch {
    const cleaned = trimTrailingSlash(backendUrl);
    if (cleaned.endsWith('/api/search')) {
      return cleaned.replace(/\/api\/search$/, '/api');
    }
    if (cleaned.endsWith('/search')) {
      return cleaned.replace(/\/search$/, '');
    }
    return cleaned;
  }
};

export const resolveSearchUrl = (backendUrl?: string): string => {
  if (!backendUrl) return `${DEFAULT_API_BASE_URL}/search`;

  const cleaned = trimTrailingSlash(backendUrl);
  if (cleaned.endsWith('/api')) {
    return `${cleaned}/search`;
  }
  return cleaned;
};

export const resolveBackendOrigin = (backendUrl?: string): string => {
  if (!backendUrl) return DEFAULT_BACKEND_ORIGIN;

  try {
    const url = new URL(backendUrl);
    return url.origin;
  } catch {
    if (backendUrl.startsWith('/')) {
      return '';
    }
    return trimTrailingSlash(backendUrl);
  }
};
