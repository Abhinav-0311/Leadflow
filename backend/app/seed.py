"""Insert fictional demo data only when the database is empty."""
import os
from datetime import UTC, datetime, timedelta, timezone

from sqlmodel import Session, SQLModel, create_engine, select

from .models import Discussion, Lead, Status


def seed(database_url: str | None = None) -> int:
    engine = create_engine(database_url or os.getenv("DATABASE_URL", "sqlite:///./leadflow.db"))
    SQLModel.metadata.create_all(engine)
    now = datetime.now(UTC)
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).replace(
        hour=14, minute=0, second=0, microsecond=0,
    ).astimezone(UTC)
    examples = [
        ("Ananya Mehta", "Meridian Studio", "+91 98765 01001", Status.PROPOSAL, today,
         "Shared the pricing proposal. Ananya is reviewing it with her co-founder.", 2),
        ("Rohan Shah", "Northstar Labs", "+91 98765 01002", Status.QUALIFIED, today + timedelta(hours=2),
         "Walked through the workflow. A good fit for their team of twelve; discuss onboarding next.", 1),
        ("Priya Nair", "Paperplane", None, Status.CONTACTED, today - timedelta(days=1),
         "Reached out after the product demo. Waiting on her preferred time for a call.", 3),
        ("Arjun Kapoor", "Fieldwork Co.", "+91 98765 01004", Status.NEW, None,
         "Asked about team plans through the website. Interested in a quick introduction.", 0),
        ("Kavya Rao", "Forma Collective", None, Status.WON, None,
         "Signed the agreement. Handed over to the onboarding team.", 7),
        ("Dev Malhotra", "Orbit Works", None, Status.LOST, None,
         "Decided to pause the project this quarter. No further action needed.", 12),
        ("Neha Desai", "Good Company", "+91 98765 01007", Status.QUALIFIED, today + timedelta(days=2),
         "Confirmed the requirements. Send a tailored proposal before our next conversation.", 1),
    ]
    try:
        with Session(engine) as session:
            if session.exec(select(Lead.id).limit(1)).first() is not None:
                return 0
            for name, company, phone, status, follow_up, note, days in examples:
                lead = Lead(name=name, company=company, phone=phone, status=status,
                            follow_up_at=follow_up, created_at=now - timedelta(days=days + 5))
                session.add(lead)
                session.flush()
                session.add(Discussion(lead_id=lead.id, note="Introduced the product and learned about the team's needs.",
                                       created_at=now - timedelta(days=days + 4)))
                session.add(Discussion(lead_id=lead.id, note=note, follow_up_at=follow_up,
                                       created_at=now - timedelta(days=days, hours=2)))
            session.commit()
        return len(examples)
    finally:
        engine.dispose()


if __name__ == "__main__":
    count = seed()
    print(f"Added {count} demo leads." if count else "Database already has leads; nothing changed.")
