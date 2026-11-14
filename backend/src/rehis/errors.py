import logging
from collections.abc import Mapping
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

# Some Cyrillic words below are \u-escaped: they consist only of letters that look like Latin
# ones, which ruff RUF001 flags.
INTERNAL_ERROR_DETAIL = "Что-то пошло не так. Попробуйте ещё раз."
VALIDATION_DETAIL = "Проверьте введённые данные"
INVALID_JSON_DETAIL = "\u041d\u0435 удалось прочитать запрос: неверный JSON"
FALLBACK_FIELD_MESSAGE = "Некорректное значение"
DATE_MESSAGE = "Введите дату в формате ГГГГ-\u041c\u041c-ДД"

_HTTP_DETAILS: Mapping[int, str] = {
    400: "Некорректный запрос",
    401: "Войдите, чтобы продолжить",
    403: "Доступ запрещён",
    404: "\u041d\u0435 найдено",
    405: "Метод не поддерживается",
    413: "Слишком большой запрос",
    415: "Отправляйте данные в формате JSON",
    429: "Слишком много запросов. Попробуйте позже.",
}

_FIXED_MESSAGES: Mapping[str, str] = {
    "missing": "Заполните поле",
    "int_parsing": "Введите целое число",
    "int_type": "Введите целое число",
    "int_from_float": "Введите целое число рублей",
    "date_parsing": DATE_MESSAGE,
    "date_from_datetime_parsing": DATE_MESSAGE,
    "date_type": DATE_MESSAGE,
    "string_type": "Введите текст",
    "string_pattern_mismatch": "Значение в неверном формате",
    "extra_forbidden": "Лишнее поле",
}


class ApiError(Exception):
    """An expected API failure, rendered as {"detail": ..., "fields": {...}}."""

    def __init__(
        self,
        status_code: int,
        detail: str,
        fields: Mapping[str, str] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.fields = dict(fields) if fields is not None else None
        self.headers = dict(headers) if headers is not None else None


def error_response(
    status_code: int,
    detail: str,
    fields: Mapping[str, str] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    content: dict[str, Any] = {"detail": detail}
    if fields:
        content["fields"] = dict(fields)
    return JSONResponse(content, status_code=status_code, headers=headers)


def internal_error_response() -> JSONResponse:
    return error_response(500, INTERNAL_ERROR_DETAIL)


def _plural_chars(count: int) -> str:
    if count % 10 == 1 and count % 100 != 11:
        return "символ"
    if count % 10 in (2, 3, 4) and count % 100 not in (12, 13, 14):
        return "символа"
    return "символов"


def _field_message(error: Mapping[str, Any]) -> str:
    error_type = str(error.get("type", ""))
    fixed = _FIXED_MESSAGES.get(error_type)
    if fixed is not None:
        return fixed
    ctx: Mapping[str, Any] = error.get("ctx") or {}
    if error_type == "greater_than_equal" and "ge" in ctx:
        return f"Значение должно быть не меньше {ctx['ge']}"
    if error_type == "greater_than" and "gt" in ctx:
        return f"Значение должно быть больше {ctx['gt']}"
    if error_type == "less_than_equal" and "le" in ctx:
        return f"Значение должно быть не больше {ctx['le']}"
    if error_type == "less_than" and "lt" in ctx:
        return f"Значение должно быть меньше {ctx['lt']}"
    if error_type == "string_too_short" and isinstance(ctx.get("min_length"), int):
        min_length: int = ctx["min_length"]
        if min_length <= 1:
            return "Заполните поле"
        return f"Минимум {min_length} {_plural_chars(min_length)}"
    if error_type == "string_too_long" and isinstance(ctx.get("max_length"), int):
        max_length: int = ctx["max_length"]
        return f"Максимум {max_length} {_plural_chars(max_length)}"
    return FALLBACK_FIELD_MESSAGE


def _field_name(error: Mapping[str, Any]) -> str:
    loc = error.get("loc") or ()
    return str(loc[-1]) if loc else "body"


def validation_error_response(exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    if any(error.get("type") == "json_invalid" for error in errors):
        return error_response(422, INVALID_JSON_DETAIL)
    fields: dict[str, str] = {}
    for error in errors:
        fields.setdefault(_field_name(error), _field_message(error))
    return error_response(422, VALIDATION_DETAIL, fields)


async def _api_error_handler(request: Request, exc: Exception) -> Response:
    if not isinstance(exc, ApiError):
        raise exc
    return error_response(exc.status_code, exc.detail, exc.fields, exc.headers)


async def _validation_error_handler(request: Request, exc: Exception) -> Response:
    if not isinstance(exc, RequestValidationError):
        raise exc
    return validation_error_response(exc)


async def _http_exception_handler(request: Request, exc: Exception) -> Response:
    if not isinstance(exc, StarletteHTTPException):
        raise exc
    headers = exc.headers
    if exc.status_code in (204, 304):
        return Response(status_code=exc.status_code, headers=headers)
    default = "Ошибка запроса" if exc.status_code < 500 else INTERNAL_ERROR_DETAIL
    detail = _HTTP_DETAILS.get(exc.status_code, default)
    return error_response(exc.status_code, detail, headers=headers)


async def _unhandled_error_handler(request: Request, exc: Exception) -> Response:
    # Only reached when no outer layer handled the exception (see SecurityHeadersMiddleware).
    logger.error(
        "Unhandled error on %s %s",
        request.method,
        request.url.path,
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    return internal_error_response()


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
    app.add_exception_handler(Exception, _unhandled_error_handler)
