/** Thrown intentionally by controllers/services — always safe to show `message` to the client. */
export class AppError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

export const errors = {
  unauthorized: (msg = 'احراز هویت نامعتبر است') => new AppError(msg, 401, 'UNAUTHORIZED'),
  forbidden: (msg = 'دسترسی غیرمجاز') => new AppError(msg, 403, 'FORBIDDEN'),
  notFound: (msg = 'یافت نشد') => new AppError(msg, 404, 'NOT_FOUND'),
  conflict: (msg = 'تداخل در داده‌ها') => new AppError(msg, 409, 'CONFLICT'),
  validation: (msg = 'داده ورودی نامعتبر است') => new AppError(msg, 422, 'VALIDATION_ERROR'),
  rateLimited: (msg = 'تعداد درخواست‌ها بیش از حد مجاز است') => new AppError(msg, 429, 'RATE_LIMITED'),
};
