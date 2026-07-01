import axios, { AxiosError, AxiosInstance } from "axios";
import type {
  CreateRequestPayload,
  ListRequestsParams,
  PaginatedRequests,
  RequestItem,
  TokenResponse,
  UpdateRequestPayload,
  User,
} from "./types";

const TOKEN_KEY = "access_token";

const api: AxiosInstance = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ detail?: string }>;
    if (axiosError.response?.data?.detail) {
      return axiosError.response.data.detail;
    }
    if (axiosError.message) {
      return axiosError.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Неизвестная ошибка";
}

export class ApiError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function wrapError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ detail?: string }>;
    const status = axiosError.response?.status ?? 0;
    const message = extractErrorMessage(error);
    return new ApiError(message, status);
  }
  return new ApiError(extractErrorMessage(error), 0);
}

export async function login(
  username: string,
  password: string,
): Promise<TokenResponse> {
  try {
    const params = new URLSearchParams();
    params.append("username", username);
    params.append("password", password);
    const response = await api.post<TokenResponse>("/auth/login", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return response.data;
  } catch (error) {
    throw wrapError(error);
  }
}

export async function fetchMe(): Promise<User> {
  try {
    const response = await api.get<User>("/auth/me");
    return response.data;
  } catch (error) {
    throw wrapError(error);
  }
}

export async function fetchRequests(
  params: ListRequestsParams,
): Promise<PaginatedRequests> {
  try {
    const response = await api.get<PaginatedRequests>("/requests", {
      params,
    });
    return response.data;
  } catch (error) {
    throw wrapError(error);
  }
}

export async function createRequest(
  payload: CreateRequestPayload,
): Promise<RequestItem> {
  try {
    const response = await api.post<RequestItem>("/requests", payload);
    return response.data;
  } catch (error) {
    throw wrapError(error);
  }
}

export async function updateRequest(
  id: number,
  payload: UpdateRequestPayload,
): Promise<RequestItem> {
  try {
    const response = await api.patch<RequestItem>(`/requests/${id}`, payload);
    return response.data;
  } catch (error) {
    throw wrapError(error);
  }
}

export async function deleteRequest(id: number): Promise<void> {
  try {
    await api.delete(`/requests/${id}`);
  } catch (error) {
    throw wrapError(error);
  }
}