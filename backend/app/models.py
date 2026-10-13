from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated

from pydantic import AwareDatetime, BaseModel, ConfigDict, StringConstraints
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Note = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]
Company = Annotated[str, StringConstraints(strip_whitespace=True, max_length=160)]
Phone = Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)]


class Status(StrEnum):
    NEW = "New"
    CONTACTED = "Contacted"
    QUALIFIED = "Qualified"
    PROPOSAL = "Proposal Sent"
    WON = "Won"
    LOST = "Lost"


class Lead(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    company: str | None = None
    phone: str | None = None
    status: Status = Status.NEW
    follow_up_at: datetime | None = None
    created_at: datetime = Field(default_factory=utcnow)


class Discussion(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    lead_id: int = Field(foreign_key="lead.id", index=True)
    note: str
    follow_up_at: datetime | None = None
    created_at: datetime = Field(default_factory=utcnow, index=True)


class LeadCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name
    company: Company | None = None
    phone: Phone | None = None


class StatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Status


class DiscussionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: Note
    follow_up_at: AwareDatetime | None = None


class LeadRead(BaseModel):
    id: int
    name: str
    company: str | None
    phone: str | None
    status: Status
    follow_up_at: datetime | None
    created_at: datetime
    last_note: str | None = None
    last_discussion_at: datetime | None = None


class DiscussionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    lead_id: int
    note: str
    follow_up_at: datetime | None
    created_at: datetime


class DiscussionSaved(BaseModel):
    lead: LeadRead
    discussion: DiscussionRead
