export interface IRateLimiter {
  tryTake(host: string): Promise<boolean> | boolean;
  msUntilToken(host: string): Promise<number> | number;
  reset?(host?: string): Promise<void> | void;
}
