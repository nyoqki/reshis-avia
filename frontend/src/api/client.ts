import type {
  AuthOptions,
  Credentials,
  ForecastRequest,
  ForecastResponse,
  HistoryResponse,
  RoutesResponse,
  UserOut,
} from "./types";

const NETWORK_MESSAGE = "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.";

const STATUS_FALLBACKS: Record<number, string> = {
  400: "Не удалось обработать запрос. Проверьте данные.",
  401: "Нужно войти в аккаунт.",
  403: "Нет доступа.",
  404: "Не найдено.",
  409: "Конфликт данных. Обновите страницу и попробуйте снова.",
  422: "Проверьте введённые данные.",
  429: "Слишком много запросов. Попробуйте чуть позже.",
};

export class ApiError extends Error {
  status: number;
  detail: string;
  fields: Record<string, string>;
  retryAfter: number | null;

  constructor(
    status: number,
    detail: string,
    fields: Record<string, string> = {},
    retryAfter: number | null = null,
  ) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.fields = fields;
    this.retryAfter = retryAfter;
  }
}

function fallbackDetail(status: number): string {
  if (STATUS_FALLBACKS[status]) return STATUS_FALLBACKS[status];
  if (status >= 500) return "Сервер временно недоступен. Попробуйте ещё раз позже.";
  return "Что-то пошло не так. Попробуйте ещё раз.";
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function toApiError(res: Response): Promise<ApiError> {
  let detail: string | undefined;
  let fields: Record<string, string> = {};
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object") {
      const b = body as { detail?: unknown; fields?: unknown };
      if (typeof b.detail === "string" && b.detail) detail = b.detail;
      if (b.fields && typeof b.fields === "object") {
        fields = Object.fromEntries(
          Object.entries(b.fields).filter(([, v]) => typeof v === "string"),
        ) as Record<string, string>;
      }
    }
  } catch {
    // non-JSON error body: use the status fallback
  }
  return new ApiError(
    res.status,
    detail ?? fallbackDetail(res.status),
    fields,
    parseRetryAfter(res.headers.get("Retry-After")),
  );
}

export async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin" };
  if (method === "POST") {
    init.headers = { "Content-Type": "application/json" };
    if (body !== undefined) init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, NETWORK_MESSAGE);
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(res.status, fallbackDetail(500));
  }
}

export const api = {
  me: () => request<UserOut>("GET", "/api/me"),
  options: () => request<AuthOptions>("GET", "/api/auth/options"),
  login: (c: Credentials) => request<UserOut>("POST", "/api/auth/login", c),
  register: (c: Credentials) => request<UserOut>("POST", "/api/auth/register", c),
  demo: () => request<UserOut>("POST", "/api/auth/demo"),
  logout: () => request<void>("POST", "/api/auth/logout"),
  routes: () => request<RoutesResponse>("GET", "/api/routes"),
  forecast: (r: ForecastRequest) => request<ForecastResponse>("POST", "/api/forecast", r),
  history: () => request<HistoryResponse>("GET", "/api/history"),
};
