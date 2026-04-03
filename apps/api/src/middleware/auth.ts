import { Request, Response, NextFunction } from 'express';

// Clerk auth middleware
// When CLERK_SECRET_KEY is set, this will validate the JWT from Clerk.
// Without the key (dev mode), requests pass through with a mock user.

let clerkMiddleware: ((req: Request, res: Response, next: NextFunction) => void) | null = null;
let requireAuth: ((req: Request, res: Response, next: NextFunction) => void) | null = null;

async function loadClerk() {
  if (!process.env.CLERK_SECRET_KEY) {
    return false;
  }
  try {
    const clerk = await import('@clerk/express');
    clerkMiddleware = clerk.clerkMiddleware() as unknown as (req: Request, res: Response, next: NextFunction) => void;
    requireAuth = clerk.requireAuth() as unknown as (req: Request, res: Response, next: NextFunction) => void;
    return true;
  } catch {
    return false;
  }
}

// Initialize Clerk asynchronously at startup
let clerkLoaded = false;
loadClerk().then((loaded) => {
  clerkLoaded = loaded;
  if (loaded) {
    console.log('[auth] Clerk authentication enabled');
  } else {
    console.log('[auth] Clerk keys not set — running in dev/open mode');
  }
});

/**
 * Apply Clerk middleware to attach auth state to request.
 * In dev mode (no CLERK_SECRET_KEY), this is a no-op.
 */
export function withClerk(req: Request, res: Response, next: NextFunction): void {
  if (clerkLoaded && clerkMiddleware) {
    clerkMiddleware(req, res, next);
  } else {
    next();
  }
}

/**
 * Require authentication.
 * In dev mode, attaches a mock userId and proceeds.
 * In production (with Clerk keys), validates the JWT.
 */
export function protect(req: Request, res: Response, next: NextFunction): void {
  if (clerkLoaded && requireAuth) {
    requireAuth(req, res, next);
  } else {
    // Dev mode: attach mock auth
    (req as Request & { auth?: { userId: string } }).auth = { userId: 'dev-user-id' };
    next();
  }
}
