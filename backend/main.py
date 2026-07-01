import math
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import (
    create_access_token,
    require_admin,
    require_user,
    verify_credentials,
)
from database import get_db, init_db
from models import Request, RequestStatus
from schemas import (
    PaginatedRequests,
    RequestCreate,
    RequestOut,
    RequestUpdate,
    SortField,
    SortOrder,
    Token,
    User,
)

app = FastAPI(title="API заявок", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    await init_db()


@app.post("/auth/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()) -> Token:
    user = verify_credentials(form_data.username, form_data.password)
    token = create_access_token(subject=user.username, is_admin=user.is_admin)
    return Token(access_token=token)


@app.get("/auth/me", response_model=User)
async def me(user: User = Depends(require_user)) -> User:
    return user


ALLOWED_STATUSES = {s.value for s in RequestStatus}


def _validate_status_transition(current: RequestStatus, target: str) -> None:
    if current == RequestStatus.DONE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Заявка уже завершена и не может быть изменена",
        )

    order = {
        RequestStatus.NEW: 0,
        RequestStatus.IN_PROGRESS: 1,
        RequestStatus.DONE: 2,
    }

    try:
        target_status = RequestStatus(target)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Некорректный статус. Допустимые: {sorted(ALLOWED_STATUSES)}",
        ) from exc

    if order[target_status] < order[current]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Нельзя вернуть заявку на предыдущий статус",
        )


@app.post("/requests", response_model=RequestOut, status_code=status.HTTP_201_CREATED)
async def create_request(
        payload: RequestCreate,
        db: AsyncSession = Depends(get_db),
        _user: User = Depends(require_user),
) -> RequestOut:
    request = Request(
        title=payload.title.strip(),
        description=payload.description.strip(),
        status=RequestStatus.NEW,
    )
    db.add(request)
    await db.flush()
    await db.refresh(request)
    return RequestOut.model_validate(request)


@app.get("/requests", response_model=PaginatedRequests)
async def list_requests(
        search: Optional[str] = Query(default=None, max_length=200),
        status_filter: Optional[str] = Query(default=None, alias="status"),
        sort_by: SortField = Query(default="created_at"),
        sort_order: SortOrder = Query(default="desc"),
        page: int = Query(default=1, ge=1),
        per_page: int = Query(default=10, ge=1, le=100),
        db: AsyncSession = Depends(get_db),
        _user: User = Depends(require_user),
) -> PaginatedRequests:
    if status_filter is not None and status_filter not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Некорректный фильтр статуса. Допустимые: {sorted(ALLOWED_STATUSES)}",
        )

    query = select(Request)
    count_query = select(func.count()).select_from(Request)

    if search:
        pattern = f"%{search.strip()}%"
        like_clause = or_(
            Request.title.ilike(pattern),
            Request.description.ilike(pattern),
        )
        query = query.where(like_clause)
        count_query = count_query.where(like_clause)

    if status_filter:
        query = query.where(Request.status == RequestStatus(status_filter))
        count_query = count_query.where(Request.status == RequestStatus(status_filter))

    sort_column = getattr(Request, sort_by, Request.created_at)
    if sort_order == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()
    pages = max(1, math.ceil(total / per_page))

    offset = (page - 1) * per_page
    query = query.offset(offset).limit(per_page)

    result = await db.execute(query)
    items = result.scalars().all()

    return PaginatedRequests(
        items=[RequestOut.model_validate(item) for item in items],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@app.get("/requests/{request_id}", response_model=RequestOut)
async def get_request(
        request_id: int,
        db: AsyncSession = Depends(get_db),
        _user: User = Depends(require_user),
) -> RequestOut:
    result = await db.execute(select(Request).where(Request.id == request_id))
    request = result.scalar_one_or_none()
    if request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заявка не найдена",
        )
    return RequestOut.model_validate(request)


@app.patch("/requests/{request_id}", response_model=RequestOut)
async def update_request(
        request_id: int,
        payload: RequestUpdate,
        db: AsyncSession = Depends(get_db),
        _user: User = Depends(require_user),
) -> RequestOut:
    result = await db.execute(select(Request).where(Request.id == request_id))
    request = result.scalar_one_or_none()
    if request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заявка не найдена",
        )

    if payload.status is not None:
        _validate_status_transition(request.status, payload.status)

    has_changes = False

    if payload.title is not None:
        new_title = payload.title.strip()
        if new_title != request.title:
            request.title = new_title
            has_changes = True

    if payload.description is not None:
        new_description = payload.description.strip()
        if new_description != request.description:
            request.description = new_description
            has_changes = True

    if payload.status is not None and RequestStatus(payload.status) != request.status:
        request.status = RequestStatus(payload.status)
        has_changes = True

    if not has_changes:
        return RequestOut.model_validate(request)

    await db.flush()
    await db.refresh(request)
    return RequestOut.model_validate(request)


@app.delete("/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_request(
        request_id: int,
        db: AsyncSession = Depends(get_db),
        _admin: User = Depends(require_admin),
) -> None:
    result = await db.execute(select(Request).where(Request.id == request_id))
    request = result.scalar_one_or_none()
    if request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заявка не найдена",
        )
    if request.status == RequestStatus.DONE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Завершённые заявки нельзя удалять",
        )
    await db.delete(request)
    await db.flush()