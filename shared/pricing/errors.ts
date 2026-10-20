/**
 * Pricing engine errors (DEV-CP-01).
 *
 * The pricing module is framework-free: every failure is expressed as a typed
 * error instead of an HTTP status, so the same code can run on the server, in
 * the browser, or inside tests.
 */

export type PricingErrorCode =
  /** Calculation request does not match the request schema. */
  | "INVALID_REQUEST"
  /** Tariff profile does not match the profile schema. */
  | "INVALID_PROFILE"
  /** Requested tariff is not defined in the profile. */
  | "TARIFF_NOT_FOUND"
  /** Requested extra position is not defined in the profile. */
  | "EXTRA_NOT_FOUND"
  /** Tariff/extra exists but its price was never confirmed. */
  | "PRICE_NOT_CONFIRMED"
  /** Method needs dimensions that were not supplied. */
  | "DIMENSIONS_REQUIRED"
  /** Extra charges for a service that is already included in the price. */
  | "INCLUDED_SERVICE_DOUBLE_CHARGE";

export class PricingError extends Error {
  readonly code: PricingErrorCode;
  readonly details?: unknown;

  constructor(code: PricingErrorCode, message: string, details?: unknown) {
    super(message);
    // Required because the repository tsconfig does not set an explicit target.
    Object.setPrototypeOf(this, PricingError.prototype);
    this.name = "PricingError";
    this.code = code;
    this.details = details;
  }
}

export function isPricingError(error: unknown): error is PricingError {
  return error instanceof PricingError;
}
