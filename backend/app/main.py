import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine, select

from .models import (
    Discussion, DiscussionCreate, DiscussionRead, DiscussionSaved,
    Lead, LeadCreate, LeadRead, StatusUpdate,
)


def lead_summary(session: Session, lead: Lead) -> LeadRead:
    latest = session.exec(
        select(Discussion).where(Discussion.lead_id == lead.id)
        .order_by(Discussion.created_at.desc(), Discussion.id.desc()).limit(1)
    ).first()
    return LeadRead(
        **lead.model_dump(),
        last_note=latest.note if latest else None,
        last_discussion_at=latest.created_at if latest else None,
    )


def create_app(database_url: str | None = None) -> FastAPI:
    engine = create_engine(
        database_url or os.getenv("DATABASE_URL", "sqlite:///./leadflow.db"),
        connect_args={"check_same_thread": False, "timeout": 10},
    )

    @event.listens_for(engine, "connect")
    def configure_sqlite(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        SQLModel.metadata.create_all(engine)
        yield
        engine.dispose()

    app = FastAPI(title="LeadFlow API", version="1.0.0", lifespan=lifespan)

    def get_session():
        with Session(engine) as session:
            yield session

    def get_lead(lead_id: int, session: Session) -> Lead:
        lead = session.get(Lead, lead_id)
        if not lead:
            raise HTTPException(404, "Lead not found.")
        return lead

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, error: RequestValidationError):
        return JSONResponse(status_code=422, content={"detail": [
            {"loc": list(item["loc"]), "msg": item["msg"], "type": item["type"]}
            for item in error.errors()
        ]})

    @app.exception_handler(Exception)
    async def unexpected_error(_: Request, __: Exception):
        return JSONResponse(status_code=500, content={"detail": "Something went wrong. Please try again."})

    @app.get("/api/health")
    def health(session: Session = Depends(get_session)):
        session.exec(select(Lead.id).limit(1)).first()
        return {"status": "ok"}

    @app.get("/api/leads", response_model=list[LeadRead])
    def list_leads(session: Session = Depends(get_session)):
        latest_id = (
            select(Discussion.id).where(Discussion.lead_id == Lead.id)
            .order_by(Discussion.created_at.desc(), Discussion.id.desc())
            .limit(1).correlate(Lead).scalar_subquery()
        )
        rows = session.exec(
            select(Lead, Discussion).outerjoin(Discussion, Discussion.id == latest_id)
            .order_by(Lead.created_at.desc(), Lead.id.desc())
        ).all()
        return [LeadRead(
            **lead.model_dump(),
            last_note=discussion.note if discussion else None,
            last_discussion_at=discussion.created_at if discussion else None,
        ) for lead, discussion in rows]

    @app.post("/api/leads", response_model=LeadRead, status_code=201)
    def add_lead(body: LeadCreate, response: Response, session: Session = Depends(get_session)):
        lead = Lead(**body.model_dump())
        session.add(lead)
        session.commit()
        session.refresh(lead)
        response.headers["Location"] = f"/api/leads/{lead.id}"
        return lead_summary(session, lead)

    @app.get("/api/leads/{lead_id}", response_model=LeadRead)
    def read_lead(lead_id: int, session: Session = Depends(get_session)):
        return lead_summary(session, get_lead(lead_id, session))

    @app.patch("/api/leads/{lead_id}", response_model=LeadRead)
    def update_status(lead_id: int, body: StatusUpdate, session: Session = Depends(get_session)):
        lead = get_lead(lead_id, session)
        lead.status = body.status
        session.add(lead)
        session.commit()
        session.refresh(lead)
        return lead_summary(session, lead)

    @app.get("/api/leads/{lead_id}/discussions", response_model=list[DiscussionRead])
    def discussions(lead_id: int, session: Session = Depends(get_session)):
        get_lead(lead_id, session)
        return session.exec(
            select(Discussion).where(Discussion.lead_id == lead_id)
            .order_by(Discussion.created_at.desc(), Discussion.id.desc())
        ).all()

    @app.post("/api/leads/{lead_id}/discussions", response_model=DiscussionSaved, status_code=201)
    def add_discussion(lead_id: int, body: DiscussionCreate, session: Session = Depends(get_session)):
        lead = get_lead(lead_id, session)
        follow_up = body.follow_up_at
        discussion = Discussion(lead_id=lead_id, note=body.note, follow_up_at=follow_up)
        session.add(discussion)
        if follow_up is not None:
            lead.follow_up_at = follow_up
            session.add(lead)
        session.commit()
        session.refresh(discussion)
        session.refresh(lead)
        return DiscussionSaved(lead=lead_summary(session, lead), discussion=DiscussionRead.model_validate(discussion))

    return app


app = create_app()
