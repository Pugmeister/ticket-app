import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ApiError,
  clearStoredToken,
  createRequest,
  deleteRequest,
  fetchMe,
  fetchRequests,
  getStoredToken,
  login,
  setStoredToken,
  updateRequest,
} from "./api";
import type {
  ListRequestsParams,
  PaginatedRequests,
  RequestItem,
  RequestStatus,
  SortField,
  SortOrder,
  User,
} from "./types";

const STATUS_LABELS: Record<RequestStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  done: "Завершена",
};

const STATUS_OPTIONS: RequestStatus[] = ["new", "in_progress", "done"];

const SORT_FIELD_OPTIONS: { value: SortField; label: string }[] = [
  { value: "created_at", label: "Дата создания" },
  { value: "updated_at", label: "Дата обновления" },
  { value: "title", label: "Заголовок" },
  { value: "status", label: "Статус" },
  { value: "id", label: "Id" },
];

const PER_PAGE_OPTIONS = [5, 10, 20, 50];

const INITIAL_FORM = {
  title: "",
  description: "",
};

function statusBadgeClass(status: RequestStatus): string {
  switch (status) {
    case "new":
      return "bg-blue-100 text-blue-800";
    case "in_progress":
      return "bg-yellow-100 text-yellow-800";
    case "done":
      return "bg-green-100 text-green-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function formatDate(value: string): string {
  try {
    const date = new Date(value);
    return date.toLocaleString("ru-RU");
  } catch {
    return value;
  }
}

export default function App(): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string>("");

  const [loginUsername, setLoginUsername] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  const [loginSubmitting, setLoginSubmitting] = useState<boolean>(false);

  const [data, setData] = useState<PaginatedRequests | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [listError, setListError] = useState<string>("");

  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "">("");
  const [sortBy, setSortBy] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number>(10);

  const [form, setForm] = useState(INITIAL_FORM);
  const [formError, setFormError] = useState<string>("");
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);

  const [actionError, setActionError] = useState<string>("");
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthLoading(false);
      return;
    }
    (async () => {
      try {
        const me = await fetchMe();
        setUser(me);
      } catch (error) {
        clearStoredToken();
        setAuthError(
          error instanceof ApiError
            ? error.message
            : "Не удалось восстановить сессию",
        );
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  const loadRequests = useCallback(async () => {
    if (!user) {
      return;
    }
    setLoading(true);
    setListError("");
    try {
      const params: ListRequestsParams = {
        sort_by: sortBy,
        sort_order: sortOrder,
        page,
        per_page: perPage,
      };
      if (search.trim()) {
        params.search = search.trim();
      }
      if (statusFilter) {
        params.status = statusFilter;
      }
      const result = await fetchRequests(params);
      setData(result);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Не удалось загрузить заявки";
      setListError(message);
    } finally {
      setLoading(false);
    }
  }, [user, search, statusFilter, sortBy, sortOrder, page, perPage]);

  useEffect(() => {
    if (user) {
      loadRequests();
    }
  }, [user, loadRequests]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");
    setLoginSubmitting(true);
    try {
      const response = await login(loginUsername, loginPassword);
      setStoredToken(response.access_token);
      const me = await fetchMe();
      setUser(me);
      setLoginUsername("");
      setLoginPassword("");
    } catch (error) {
      setAuthError(
        error instanceof ApiError ? error.message : "Ошибка входа",
      );
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleLogout = () => {
    clearStoredToken();
    setUser(null);
    setData(null);
    setForm(INITIAL_FORM);
    setFormError("");
    setActionError("");
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    const title = form.title.trim();
    if (!title) {
      setFormError("Заголовок обязателен");
      return;
    }
    setFormSubmitting(true);
    try {
      await createRequest({
        title,
        description: form.description.trim(),
      });
      setForm(INITIAL_FORM);
      if (page !== 1) {
        setPage(1);
      } else {
        await loadRequests();
      }
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : "Не удалось создать заявку",
      );
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleStatusChange = async (
    request: RequestItem,
    nextStatus: RequestStatus,
  ) => {
    if (request.status === nextStatus) {
      return;
    }
    setActionError("");
    setBusyId(request.id);
    try {
      await updateRequest(request.id, { status: nextStatus });
      await loadRequests();
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.message
          : "Не удалось обновить заявку",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (request: RequestItem) => {
    if (!user?.is_admin) {
      setActionError("Удалять заявки может только администратор");
      return;
    }
    const confirmed = window.confirm(
      `Удалить заявку #${request.id} "${request.title}"?`,
    );
    if (!confirmed) {
      return;
    }
    setActionError("");
    setBusyId(request.id);
    try {
      await deleteRequest(request.id);
      await loadRequests();
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.message
          : "Не удалось удалить заявку",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
    setPage(1);
  };

  const handleStatusFilterChange = (
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    const value = event.target.value as RequestStatus | "";
    setStatusFilter(value);
    setPage(1);
  };

  const handleSortFieldChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSortBy(event.target.value as SortField);
    setPage(1);
  };

  const handleSortOrderChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSortOrder(event.target.value as SortOrder);
    setPage(1);
  };

  const handlePerPageChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setPerPage(Number(event.target.value));
    setPage(1);
  };

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
  };

  const paginationRange = useMemo(() => {
    if (!data) {
      return [] as number[];
    }
    const total = data.pages;
    const current = data.page;
    const delta = 2;
    const range: number[] = [];
    const left = Math.max(2, current - delta);
    const right = Math.min(total - 1, current + delta);
    range.push(1);
    if (left > 2) {
      range.push(-1);
    }
    for (let i = left; i <= right; i += 1) {
      range.push(i);
    }
    if (right < total - 1) {
      range.push(-2);
    }
    if (total > 1) {
      range.push(total);
    }
    return range;
  }, [data]);

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-600">Загрузка...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow">
          <h1 className="mb-4 text-xl font-semibold">Вход в систему</h1>
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Имя пользователя
              </label>
              <input
                type="text"
                value={loginUsername}
                onChange={(event) => setLoginUsername(event.target.value)}
                required
                autoComplete="username"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Пароль
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            {authError && (
              <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                {authError}
              </div>
            )}
            <button
              type="submit"
              disabled={loginSubmitting}
              className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {loginSubmitting ? "Вход..." : "Войти"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Заявки</h1>
          <p className="text-sm text-gray-600">
            Вы вошли как{" "}
            <span className="font-medium">{user.username}</span>
            {user.is_admin && (
              <span className="ml-2 rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-800">
                администратор
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Выйти
        </button>
      </header>

      <section className="mb-6 rounded-lg bg-white p-4 shadow">
        <h2 className="mb-3 text-lg font-semibold">Создать заявку</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Заголовок
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, title: event.target.value }))
              }
              maxLength={200}
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Описание
            </label>
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
              maxLength={5000}
              rows={3}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          {formError && (
            <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}
          <button
            type="submit"
            disabled={formSubmitting}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {formSubmitting ? "Создание..." : "Создать"}
          </button>
        </form>
      </section>

      <section className="mb-4 rounded-lg bg-white p-4 shadow">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Поиск
            </label>
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Поиск по заголовку или описанию"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Статус
            </label>
            <select
              value={statusFilter}
              onChange={handleStatusFilterChange}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Все</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Сортировать по
            </label>
            <select
              value={sortBy}
              onChange={handleSortFieldChange}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {SORT_FIELD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Порядок
            </label>
            <select
              value={sortOrder}
              onChange={handleSortOrderChange}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="asc">По возрастанию</option>
              <option value="desc">По убыванию</option>
            </select>
          </div>
        </div>
      </section>

      {actionError && (
        <div className="mb-4 rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <section className="rounded-lg bg-white shadow">
        {loading && !data ? (
          <div className="p-6 text-center text-gray-600">Загрузка...</div>
        ) : listError ? (
          <div className="p-6 text-center text-red-600">{listError}</div>
        ) : data && data.items.length === 0 ? (
          <div className="p-6 text-center text-gray-600">
            Заявки не найдены
          </div>
        ) : data ? (
          <div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">
                      Id
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">
                      Заголовок
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">
                      Описание
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">
                      Статус
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">
                      Создана
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.items.map((item) => {
                    const isBusy = busyId === item.id;
                    const isDone = item.status === "done";
                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 align-top text-gray-700">
                          {item.id}
                        </td>
                        <td className="px-4 py-2 align-top font-medium text-gray-900">
                          {item.title}
                        </td>
                        <td className="px-4 py-2 align-top text-gray-600">
                          {item.description || "—"}
                        </td>
                        <td className="px-4 py-2 align-top">
                          <select
                            value={item.status}
                            disabled={isBusy || isDone}
                            onChange={(event) =>
                              handleStatusChange(
                                item,
                                event.target.value as RequestStatus,
                              )
                            }
                            className={`rounded border border-gray-300 px-2 py-1 text-xs ${statusBadgeClass(
                              item.status,
                            )} ${
                              isDone || isBusy
                                ? "cursor-not-allowed opacity-70"
                                : ""
                            }`}
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {STATUS_LABELS[option]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2 align-top text-gray-600">
                          {formatDate(item.created_at)}
                        </td>
                        <td className="px-4 py-2 align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            {user.is_admin && (
                              <button
                                type="button"
                                disabled={isBusy || isDone}
                                onClick={() => handleDelete(item)}
                                className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                              >
                                {isBusy ? "Удаление..." : "Удалить"}
                              </button>
                            )}
                            {!user.is_admin && (
                              <span className="text-xs text-gray-400">
                                Только админ
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <span>
                  Страница {data.page} из {data.pages}
                </span>
                <span>·</span>
                <span>
                  {data.total} {data.total === 1 ? "заявка" : "заявок"}
                </span>
                <span>·</span>
                <label className="flex items-center gap-1">
                  <span>На странице</span>
                  <select
                    value={perPage}
                    onChange={handlePerPageChange}
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                  >
                    {PER_PAGE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={data.page <= 1 || loading}
                  onClick={() => handlePageChange(data.page - 1)}
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Назад
                </button>
                {paginationRange.map((value, index) => {
                  if (value < 0) {
                    return (
                      <span
                        key={`ellipsis-${index}`}
                        className="px-1 text-gray-400"
                      >
                        …
                      </span>
                    );
                  }
                  const isActive = value === data.page;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={loading}
                      onClick={() => handlePageChange(value)}
                      className={`rounded border px-2 py-1 text-xs ${
                        isActive
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-gray-300 bg-white hover:bg-gray-50"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {value}
                    </button>
                  );
                })}
                <button
                  type="button"
                  disabled={data.page >= data.pages || loading}
                  onClick={() => handlePageChange(data.page + 1)}
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Вперёд
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {loading && data && (
          <div className="border-t border-gray-200 px-4 py-2 text-center text-xs text-gray-500">
            Обновление...
          </div>
        )}
      </section>
    </div>
  );
}