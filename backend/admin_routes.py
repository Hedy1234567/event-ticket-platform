
from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from admin_auth import (
    authenticate_admin,
    create_admin_token,
    require_admin
)
from database import engine


router = APIRouter(
    prefix="/admin",
    tags=["Admin"]
)


# ---------------------------------
# MODELS
# ---------------------------------

class AdminLogin(BaseModel):
    username: str
    password: str


class EventInput(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: Optional[str] = None
    location: str = Field(min_length=1, max_length=150)
    event_date: datetime
    price: Decimal = Field(
        ge=0,
        max_digits=10,
        decimal_places=2
    )


# ---------------------------------
# ADMIN LOGIN
# ---------------------------------

@router.post("/login")
def admin_login(data: AdminLogin):
    if not authenticate_admin(
        data.username,
        data.password
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid admin credentials"
        )

    return {
        "access_token": create_admin_token(data.username),
        "token_type": "bearer"
    }


# ---------------------------------
# DASHBOARD STATISTICS
# ---------------------------------

@router.get("/stats")
def get_admin_stats(
    _: str = Depends(require_admin)
):
    with engine.connect() as connection:
        total_events = connection.execute(
            text("SELECT COUNT(*) FROM events")
        ).scalar_one()

        total_orders = connection.execute(
            text("SELECT COUNT(*) FROM orders")
        ).scalar_one()

        paid_orders = connection.execute(
            text("""
                SELECT COUNT(*)
                FROM orders
                WHERE status = 'PAID'
            """)
        ).scalar_one()

        tickets_issued = connection.execute(
            text("SELECT COUNT(*) FROM tickets")
        ).scalar_one()

        tickets_checked_in = connection.execute(
            text("""
                SELECT COUNT(*)
                FROM tickets
                WHERE used_at IS NOT NULL
            """)
        ).scalar_one()

        demo_revenue = connection.execute(
            text("""
                SELECT COALESCE(SUM(amount), 0)
                FROM orders
                WHERE status = 'PAID'
            """)
        ).scalar_one()

    return {
        "total_events": total_events,
        "total_orders": total_orders,
        "paid_orders": paid_orders,
        "tickets_issued": tickets_issued,
        "tickets_checked_in": tickets_checked_in,
        "demo_revenue_tnd": float(demo_revenue)
    }


# ---------------------------------
# LIST EVENTS
# ---------------------------------

@router.get("/events")
def get_admin_events(
    _: str = Depends(require_admin)
):
    with engine.connect() as connection:
        rows = connection.execute(
            text("""
                SELECT
                    id,
                    name,
                    description,
                    location,
                    event_date,
                    price
                FROM events
                ORDER BY event_date
            """)
        ).mappings().all()

    return [dict(row) for row in rows]


# ---------------------------------
# CREATE EVENT
# ---------------------------------

@router.post("/events", status_code=201)
def create_admin_event(
    data: EventInput,
    _: str = Depends(require_admin)
):
    with engine.begin() as connection:
        result = connection.execute(
            text("""
                INSERT INTO events (
                    name,
                    description,
                    location,
                    event_date,
                    price
                )
                VALUES (
                    :name,
                    :description,
                    :location,
                    :event_date,
                    :price
                )
            """),
            data.model_dump()
        )

        event_id = result.lastrowid

    return {
        "id": event_id,
        "message": "Event created"
    }


# ---------------------------------
# UPDATE EVENT
# ---------------------------------

@router.put("/events/{event_id}")
def update_admin_event(
    event_id: int,
    data: EventInput,
    _: str = Depends(require_admin)
):
    with engine.begin() as connection:
        exists = connection.execute(
            text("""
                SELECT id
                FROM events
                WHERE id = :id
            """),
            {"id": event_id}
        ).first()

        if exists is None:
            raise HTTPException(
                status_code=404,
                detail="Event not found"
            )

        connection.execute(
            text("""
                UPDATE events
                SET
                    name = :name,
                    description = :description,
                    location = :location,
                    event_date = :event_date,
                    price = :price
                WHERE id = :id
            """),
            {
                **data.model_dump(),
                "id": event_id
            }
        )

    return {
        "id": event_id,
        "message": "Event updated"
    }


# ---------------------------------
# DELETE EVENT
# ---------------------------------

@router.delete("/events/{event_id}")
def delete_admin_event(
    event_id: int,
    _: str = Depends(require_admin)
):
    with engine.begin() as connection:
        exists = connection.execute(
            text("""
                SELECT id
                FROM events
                WHERE id = :id
                FOR UPDATE
            """),
            {"id": event_id}
        ).first()

        if exists is None:
            raise HTTPException(
                status_code=404,
                detail="Event not found"
            )

        reservations = connection.execute(
            text("""
                SELECT COUNT(*)
                FROM orders
                WHERE event_id = :id
            """),
            {"id": event_id}
        ).scalar_one()

        if reservations > 0:
            raise HTTPException(
                status_code=409,
                detail="Cannot delete an event with reservations"
            )

        connection.execute(
            text("""
                DELETE FROM events
                WHERE id = :id
            """),
            {"id": event_id}
        )

    return {
        "message": "Event deleted"
    }


# ---------------------------------
# LIST ORDERS
# ---------------------------------

@router.get("/orders")
def get_admin_orders(
    _: str = Depends(require_admin)
):
    with engine.connect() as connection:
        rows = connection.execute(
            text("""
                SELECT
                    o.id,
                    o.event_id,
                    e.name AS event_name,
                    o.customer_email,
                    o.amount,
                    o.currency,
                    o.status,
                    o.created_at
                FROM orders o
                JOIN events e
                    ON e.id = o.event_id
                ORDER BY o.created_at DESC, o.id DESC
            """)
        ).mappings().all()

    return [dict(row) for row in rows]


# ---------------------------------
# LIST TICKETS
# ---------------------------------

@router.get("/tickets")
def get_admin_tickets(
    _: str = Depends(require_admin)
):
    with engine.connect() as connection:
        rows = connection.execute(
            text("""
                SELECT
                    t.id,
                    t.order_id,
                    o.event_id,
                    e.name AS event_name,
                    o.customer_email,
                    t.created_at,
                    t.used_at
                FROM tickets t
                JOIN orders o
                    ON o.id = t.order_id
                JOIN events e
                    ON e.id = o.event_id
                ORDER BY t.id DESC
            """)
        ).mappings().all()

    return [dict(row) for row in rows]
