enum Reason {
  INVALID_AUTH,
  INVALID_ARGUMENT,
  INTERNAL,
  NOT_FOUND,
  ALREADY_EXISTS,
  BAD_STATE,
}

class ExpectedError extends Error {
  readonly reason: Reason;

  constructor(message: string, reason: Reason = Reason.INTERNAL) {
    super(message);
    this.name = "ExpectedError";
    this.reason = reason;
  }
}
export { ExpectedError, Reason };
