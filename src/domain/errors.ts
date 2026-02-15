export type DomainErrorCode =
  | "MATCH_FULL"
  | "MATCH_CANCELED"
  | "ORGANIZER_MUST_CANCEL"
  | "ALREADY_JOINED"
  | "NOT_JOINED"
  | "ALIAS_REQUIRED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "OTP_INVALID"
  | "OTP_EXPIRED"
  | "TOURNAMENT_ALREADY_REGISTERED"
  | "TOURNAMENT_CAPACITY_REACHED"
  | "TOURNAMENT_CATEGORY_FROZEN";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
