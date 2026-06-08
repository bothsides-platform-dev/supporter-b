export function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.AUTH_URL ??
    'http://localhost:3000'
  );
}
