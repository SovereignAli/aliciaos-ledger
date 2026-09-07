/** The institution wants the user back: credentials changed, MFA, consent expired. */
export class ProviderAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProviderAuthError";
    this.code = code;
  }
}

/** Anything else the provider refused to do. Surfaced as institution.status = 'error'. */
export class ProviderError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
  }
}
