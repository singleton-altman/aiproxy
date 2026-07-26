import { API_ENDPOINTS, API_MODULES } from '@/src/api/endpoints.generated';
import { apiFetch, type ApiResult } from '@/src/lib/api';
import { sessionState } from '@/src/store/session';
import type { ApiEndpointCall, ApiEndpointDefinition, ApiRecord, HttpMethod } from '@/src/types/api';

export type EndpointResult = ApiResult;

type EndpointQuery = ApiRecord | unknown[];
type EndpointRunnerCall = Omit<ApiEndpointCall, 'query'> & { query?: EndpointQuery };

const dangerousGetActions = /\/(restart|rollback|update|refresh|reset|recover|revoke|sync|probe|cleanup|test|import|bulk|cancel|submit|start|complete|select-profile)(\/|$)/i;
const longRunningActions = /\/(import|export|update|sync|probe|bulk|test)(?:[/?]|$)/i;

export function getApiModules() {
  return API_MODULES;
}

export function getApiEndpoints(module?: string) {
  return module ? API_ENDPOINTS.filter((endpoint) => endpoint.module === module) : API_ENDPOINTS;
}

export function getApiEndpoint(id: string) {
  return API_ENDPOINTS.find((endpoint) => endpoint.id === id);
}

export function isDangerousApiRequest(endpoint: ApiEndpointDefinition, method: HttpMethod) {
  if (method !== 'GET') return true;
  return dangerousGetActions.test(endpoint.path);
}

function appendQueryValue(params: string[], key: string, value: unknown) {
  if (!key || value === undefined || value === null || value === '') return;
  if (Array.isArray(value)) {
    value.forEach((item) => appendQueryValue(params, key, item));
    return;
  }
  const encodedValue = encodeURIComponent(typeof value === 'object' ? JSON.stringify(value) : String(value));
  params.push(`${encodeURIComponent(key)}=${encodedValue}`);
}

function appendQuery(path: string, query?: EndpointQuery) {
  if (!query || Object.keys(query).length === 0) return path;
  const params: string[] = [];
  if (Array.isArray(query)) {
    query.forEach((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const entry = item as ApiRecord;
        const key = String(entry.key ?? entry.Key ?? entry.name ?? entry.Name ?? '').trim();
        const value = entry.value ?? entry.Value;
        appendQueryValue(params, key, value);
      } else appendQueryValue(params, 'value', item);
    });
  } else Object.entries(query).forEach(([key, value]) => appendQueryValue(params, key, value));
  const text = params.join('&');
  return text ? `${path}${path.includes('?') ? '&' : '?'}${text}` : path;
}

export function resolveEndpointPath(call: EndpointRunnerCall) {
  let path = call.endpoint.path;
  call.endpoint.pathVariables.forEach((variable) => {
    const value = call.pathValues?.[variable];
    if (!value?.trim()) throw new Error(`请填写路径参数 ${variable}`);
    path = path.replaceAll(`\${${variable}}`, encodeURIComponent(value.trim()));
  });
  return appendQuery(path, call.query);
}

function getBody(body: unknown) {
  if (body === undefined || body === null) return undefined;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const isBlob = typeof Blob !== 'undefined' && body instanceof Blob;
  if (typeof body === 'string' || isFormData || isBlob) return body;
  return JSON.stringify(body);
}

export async function callApiEndpoint(call: EndpointRunnerCall): Promise<EndpointResult> {
  if (!call.endpoint.methods.includes(call.method)) throw new Error('该端点不支持所选请求方法');
  if (!sessionState.baseUrl) throw new Error('请先填写服务地址');
  const path = resolveEndpointPath(call);
  const requestBody = ['GET', 'HEAD'].includes(call.method) ? undefined : getBody(call.body);
  const likelyBinary = /\/(?:export|download)(?:[/?]|$)/i.test(path);
  const headers: Record<string, string> = {};
  if (call.endpoint.auth === 'apikey' && sessionState.apiKey) {
    headers.Authorization = `Bearer ${sessionState.apiKey}`;
  }
  return apiFetch(path, {
    method: call.method,
    body: requestBody as BodyInit | undefined,
    headers,
    signal: call.signal,
    retryAuth: call.retryAuth,
    responseType: likelyBinary ? 'blob' : 'auto',
    timeoutMs: longRunningActions.test(path) ? 600000 : 20000,
  });
}
