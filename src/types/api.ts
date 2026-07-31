export type ApiRecord = Record<string, unknown>;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type EndpointAuth = 'public' | 'session' | 'apikey';

export type ApiEndpointDefinition = {
  id: string;
  path: string;
  methods: HttpMethod[];
  module: string;
  auth: EndpointAuth;
  source: string;
  notes: string;
  pathVariables: string[];
};

export type ApiModuleDefinition = {
  key: string;
  label: string;
  endpointCount: number;
  methodCount: number;
};

export type ApiEndpointCall = {
  endpoint: ApiEndpointDefinition;
  method: HttpMethod;
  pathValues?: Record<string, string>;
  query?: ApiRecord | unknown[];
  body?: unknown;
  retryAuth?: boolean;
  signal?: AbortSignal;
};

export type PublicConfig = {
  allow_open_registration?: boolean;
  email_verification_enabled?: boolean;
  require_invite_code?: boolean;
  site_name?: string;
};

export type UserProfile = ApiRecord & {
  id?: string | number;
  email?: string;
  name?: string;
  role?: string;
  disabled?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ApiKeyItem = ApiRecord & {
  id?: string | number;
  name?: string;
  prefix?: string;
  secret?: string;
  created_at?: string;
  last_used_at?: string | null;
  expires_at?: string | null;
  disabled?: boolean;
  scopes?: string[];
};

export type ModelItem = ApiRecord & {
  id?: string;
  object?: string;
  owned_by?: string;
  provider?: string;
  family?: string;
  modalities?: string[];
  prompt_price_per_1m?: number;
  completion_price_per_1m?: number;
  hidden?: boolean;
  free?: boolean;
};

export type UsageOverview = ApiRecord & {
  request_count?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
};

export type UsageTrendItem = ApiRecord & {
  bucket_start?: string;
  count?: number;
  request_count?: number;
  success_count?: number;
  failed_count?: number;
  total_tokens?: number;
  cost?: number;
};

export type RequestLogItem = ApiRecord & {
  id?: string;
  created_at?: string;
  api_key_id?: string | number;
  model?: string;
  provider?: string;
  status?: string | number;
  status_code?: number;
  latency_ms?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  error?: string | null;
};

export type BalanceInfo = ApiRecord & {
  balance?: number;
  currency?: string;
  credit?: number;
};

export type PlanItem = ApiRecord & {
  id?: string | number;
  name?: string;
  description?: string;
  price?: number;
  currency?: string;
  limits?: ApiRecord;
  created_at?: string;
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};
