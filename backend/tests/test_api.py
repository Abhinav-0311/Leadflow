from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, select

from app.main import create_app
from app.models import Discussion, Lead
from app.seed import seed


@pytest.fixture
def database_url(tmp_path):
    return f"sqlite:///{tmp_path / 'test.db'}"


@pytest.fixture
def client(database_url):
    with TestClient(create_app(database_url)) as client:
        yield client


def test_lead_defaults_validation_and_missing_ids(client):
    assert client.get("/api/leads").json() == []
    assert client.post("/api/leads", json={"name": "  "}).status_code == 422
    assert client.post("/api/leads", json={"name": "A", "status": "Won"}).status_code == 422
    response = client.post("/api/leads", json={"name": "  Alex  ", "phone": "+91 123"})
    assert response.status_code == 201
    lead = response.json()
    assert lead["name"] == "Alex" and lead["status"] == "New"
    assert lead["last_note"] is None and lead["follow_up_at"] is None
    assert lead["created_at"].endswith("Z")
    assert client.get("/api/leads/999/discussions").status_code == 404
    assert client.patch("/api/leads/999", json={"status": "Won"}).status_code == 404
    assert client.post("/api/leads/999/discussions", json={"note": "Hello"}).status_code == 404


def test_discussion_updates_summary_and_preserves_follow_up(client):
    lead_id = client.post("/api/leads", json={"name": "Alex"}).json()["id"]
    path = f"/api/leads/{lead_id}/discussions"
    response = client.post(path, json={"note": "  Sent proposal  ", "follow_up_at": "2026-10-14T14:00:00+05:30"})
    assert response.status_code == 201
    result = response.json()
    assert result["lead"]["follow_up_at"] == "2026-10-14T08:30:00Z"
    assert result["lead"]["last_note"] == "Sent proposal"
    assert result["discussion"]["follow_up_at"] == result["lead"]["follow_up_at"]
    client.post(path, json={"note": "Another conversation"})
    summary = client.get("/api/leads").json()[0]
    assert summary["last_note"] == "Another conversation"
    assert summary["follow_up_at"] == "2026-10-14T08:30:00Z"
    notes = client.get(path).json()
    assert [n["note"] for n in notes] == ["Another conversation", "Sent proposal"]
    assert summary["last_discussion_at"] == notes[0]["created_at"]


@pytest.mark.parametrize("body", [
    {"note": " "}, {"note": "x" * 5001},
    {"note": "hello", "follow_up_at": "2026-10-14T14:00:00"},
    {"note": "hello", "follow_up_at": "not a date"},
])
def test_invalid_discussion_is_not_written(client, body):
    lead_id = client.post("/api/leads", json={"name": "Alex"}).json()["id"]
    path = f"/api/leads/{lead_id}/discussions"
    assert client.post(path, json=body).status_code == 422
    assert client.get(path).json() == []


def test_status_and_notes_survive_new_app(client, database_url):
    lead_id = client.post("/api/leads", json={"name": "Alex"}).json()["id"]
    assert client.patch(f"/api/leads/{lead_id}", json={"status": "invalid"}).status_code == 422
    for status in ["Contacted", "Qualified", "Proposal Sent", "Won", "Lost"]:
        response = client.patch(f"/api/leads/{lead_id}", json={"status": status})
        assert response.status_code == 200 and response.json()["status"] == status
    client.post(f"/api/leads/{lead_id}/discussions", json={"note": "Saved permanently"})
    with TestClient(create_app(database_url)) as restarted:
        lead = restarted.get("/api/leads").json()[0]
        assert lead["status"] == "Lost" and lead["last_note"] == "Saved permanently"


def test_timestamp_ties_have_stable_order(client, database_url):
    lead_id = client.post("/api/leads", json={"name": "Alex"}).json()["id"]
    engine = create_engine(database_url)
    with Session(engine) as session:
        for note in ["First", "Second"]:
            session.add(Discussion(lead_id=lead_id, note=note, created_at=datetime(2026, 10, 13, tzinfo=UTC)))
        session.commit()
    engine.dispose()
    assert [d["note"] for d in client.get(f"/api/leads/{lead_id}/discussions").json()] == ["Second", "First"]
    assert client.get("/api/leads").json()[0]["last_note"] == "Second"


def test_seed_is_non_destructive(database_url):
    assert seed(database_url) == 7
    assert seed(database_url) == 0
    engine = create_engine(database_url)
    with Session(engine) as session:
        assert len(session.exec(select(Lead)).all()) == 7
        assert len(session.exec(select(Discussion)).all()) == 14
    engine.dispose()
