// Only invitation destinations are supported. Never navigate to a user-supplied external URL.
export function loginDestination(value: string | null) {
  return value && /^\/invite\/[A-Za-z0-9_-]{43}$/.test(value) ? value : "/favorites";
}
