from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str
    exp: int


class User(BaseModel):
    username: str
    is_admin: bool


class RequestCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)


class RequestUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    status: Optional[Literal["new", "in_progress", "done"]] = None


class RequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    status: str
    created_at: datetime
    updated_at: datetime


class PaginatedRequests(BaseModel):
    items: List[RequestOut]
    total: int
    page: int
    per_page: int
    pages: int


SortField = Literal["id", "title", "status", "created_at", "updated_at"]
SortOrder = Literal["asc", "desc"]