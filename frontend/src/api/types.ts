export interface UserOut {
  username: string;
  is_demo: boolean;
}

export interface AuthOptions {
  demo_enabled: boolean;
  registration_open: boolean;
}

export interface Credentials {
  username: string;
  password: string;
}

export interface RouteOption {
  code: string;
  origin: string;
  destination: string;
  base_price: number;
  price_min: number;
  price_max: number;
}

export interface RoutesResponse {
  origin: string;
  date_min: string;
  date_max: string;
  routes: RouteOption[];
}

export interface ForecastRequest {
  origin: string;
  destination: string;
  date: string;
  price: number;
}

export interface Scenario {
  quantile: number;
  wants: number;
  wants_raw: number;
  buys: number;
  hits_seats: boolean;
}

export interface SelloutBand {
  low_pct: number | null;
  high_pct: number | null;
}

export interface Recommendation {
  price: number;
  corridor_low: number;
  corridor_high: number;
  corridor_pct: number;
  risky: boolean;
}

export interface ForecastResponse {
  route: string;
  origin: string;
  destination: string;
  date: string;
  price: number;
  seats: number;
  wants: number;
  wants_raw: number;
  buys: number;
  free_seats: number;
  limit: "none" | "no_demand" | "seats";
  base_price: number;
  price_min: number;
  price_max: number;
  price_in_range: boolean;
  scenarios: Scenario[];
  sellout: SelloutBand;
  recommendation: Recommendation;
  history_id: number;
}

export interface HistoryItem {
  id: number;
  route: string;
  origin: string;
  destination: string;
  date: string;
  price: number;
  seats: number;
  wants: number;
  buys: number;
  created_at: string;
}

export interface HistoryResponse {
  items: HistoryItem[];
}

export interface ApiErrorBody {
  detail: string;
  fields?: Record<string, string>;
}
