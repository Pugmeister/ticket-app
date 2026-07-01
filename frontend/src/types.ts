export type RequestStatus = "new" | "in_progress" | "done";

export interface RequestItem {
  id: number;
  title: string;
  description: string;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
}

export interface PaginatedRequests {
  items: RequestItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface CreateRequestPayload {
  title: string;
  description: string;
}

export interface UpdateRequestPayload {
  title?: string;
  description?: string;
  status?: RequestStatus;
}

export interface ListRequestsParams {
  search?: string;
  status?: RequestStatus | "";
  sort_by?: "id" | "title" | "status" | "created_at" | "updated_at";
  sort_order?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

export interface User {
  username: string;
  is_admin: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface ApiErrorPayload {
  detail?: string;
}

export type SortField = ListRequestsParams["sort_by"];
export type SortOrder = ListRequestsParams["sort_order"];