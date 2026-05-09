export function auth() {
  return (_req: unknown, _res: unknown, next: () => void) => {
    next();
  };
}
