export type DomainErrorCode =
  | "MATCH_FULL"
  | "MATCH_CANCELED"
  | "ORGANIZER_MUST_CANCEL"
  | "ALREADY_JOINED"
  | "NOT_JOINED"
  | "ALIAS_REQUIRED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "OTP_INVALID"
  | "OTP_EXPIRED";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
