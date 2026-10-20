
import io
import os
import secrets

import qrcode
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import text

from database import engine, get_events_from_db
from admin_routes import router as admin_router


load_dotenv()

app = FastAPI(title="Event Ticket API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
        "http://localhost:60251",
        "https://vercel.com/hedy1234567"
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=[
        "Content-Type",
        "X-Ticket-Token",
        "X-Checkin-Key",
        "Authorization"
    ],
)

app.include_router(admin_router)


# ---------------------------------
# SECURITY
# ---------------------------------

def verify_checkin_key(
    x_checkin_key: str = Header(...)
):
    expected_key = os.getenv("CHECKIN_API_KEY")

    if (
        not expected_key
        or not secrets.compare_digest(x_checkin_key, expected_key)
    ):
        raise HTTPException(
            status_code=403,
            detail="Invalid check-in key"
        )


# ---------------------------------
# EVENTS
# ---------------------------------

@app.get("/")
def home():
    return {"message": "Event Ticket API is running"}


@app.get("/events")
def get_events():
    return get_events_from_db()


# ---------------------------------
# ORDERS
# ---------------------------------

class OrderCreate(BaseModel):
    event_id: int
    customer_email: EmailStr


@app.post("/orders", status_code=201)
def create_order(order: OrderCreate):
    with engine.begin() as connection:
        event = connection.execute(
            text("""
                SELECT price
                FROM events
                WHERE id = :event_id
            """),
            {"event_id": order.event_id}
        ).mappings().first()

        if event is None:
            raise HTTPException(
                status_code=404,
                detail="Event not found"
            )

        access_token = secrets.token_hex(32)

        result = connection.execute(
            text("""
                INSERT INTO orders (
                    event_id,
                    customer_email,
                    amount,
                    currency,
                    status,
                    access_token
                )
                VALUES (
                    :event_id,
                    :email,
                    :amount,
                    'TND',
                    'PENDING',
                    :access_token
                )
            """),
            {
                "event_id": order.event_id,
                "email": str(order.customer_email),
                "amount": event["price"],
                "access_token": access_token
            }
        )

        order_id = result.lastrowid

    return {
        "order_id": order_id,
        "status": "PENDING",
        "message": "Reservation created",
        "access_token": access_token
    }


@app.get("/orders/{order_id}")
def get_order(
    order_id: int,
    x_ticket_token: str = Header(...)
):
    with engine.connect() as connection:
        order = connection.execute(
            text("""
                SELECT id, event_id, customer_email,
                       amount, currency, status
                FROM orders
                WHERE id = :order_id
                  AND access_token = :access_token
            """),
            {
                "order_id": order_id,
                "access_token": x_ticket_token
            }
        ).mappings().first()

    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Reservation not found or access denied"
        )

    return dict(order)


# ---------------------------------
# DEMO PAYMENT (LOCAL TEST ONLY)
# ---------------------------------

@app.post("/demo/pay/{order_id}")
def demo_pay(
    order_id: int,
    request: Request,
    x_ticket_token: str = Header(...)
):
    demo_enabled = (
        os.getenv("DEMO_PAYMENT_ENABLED", "false").lower()
        == "true"
    )

    local_client = (
        request.client is not None
        and request.client.host in ("127.0.0.1", "::1")
    )

    if not demo_enabled or not local_client:
        raise HTTPException(
            status_code=403,
            detail="Demo payments are disabled"
        )

    with engine.begin() as connection:
        result = connection.execute(
            text("""
                UPDATE orders
                SET status = 'PAID'
                WHERE id = :order_id
                  AND status = 'PENDING'
                  AND access_token = :access_token
            """),
            {
                "order_id": order_id,
                "access_token": x_ticket_token
            }
        )

        if result.rowcount == 0:
            raise HTTPException(
                status_code=400,
                detail="Order not found, already processed, or access denied"
            )

        ticket_code = secrets.token_hex(32)

        ticket_result = connection.execute(
            text("""
                INSERT INTO tickets (
                    order_id,
                    ticket_code
                )
                VALUES (
                    :order_id,
                    :ticket_code
                )
            """),
            {
                "order_id": order_id,
                "ticket_code": ticket_code
            }
        )

        ticket_id = ticket_result.lastrowid

    return {
        "order_id": order_id,
        "payment": "SIMULATED",
        "status": "PAID",
        "ticket_id": ticket_id,
        "message": "Demo payment successful"
    }


# ---------------------------------
# QR CODE
# ---------------------------------

@app.get("/tickets/{ticket_id}/qr")
def get_ticket_qr(
    ticket_id: int,
    x_ticket_token: str = Header(...)
):
    with engine.connect() as connection:
        ticket = connection.execute(
            text("""
                SELECT t.ticket_code
                FROM tickets t
                JOIN orders o ON o.id = t.order_id
                WHERE t.id = :ticket_id
                  AND o.status = 'PAID'
                  AND o.access_token = :access_token
            """),
            {
                "ticket_id": ticket_id,
                "access_token": x_ticket_token
            }
        ).mappings().first()

    if ticket is None:
        raise HTTPException(
            status_code=404,
            detail="Ticket not found or access denied"
        )

    qr = qrcode.make(ticket["ticket_code"])

    image_buffer = io.BytesIO()
    qr.save(image_buffer, format="PNG")
    image_buffer.seek(0)

    return StreamingResponse(
        image_buffer,
        media_type="image/png",
        headers={"Cache-Control": "no-store"}
    )


# ---------------------------------
# TICKET VERIFICATION
# ---------------------------------

class TicketVerification(BaseModel):
    ticket_code: str


@app.post("/tickets/verify")
def verify_ticket(
    data: TicketVerification,
    _: None = Depends(verify_checkin_key)
):
    with engine.connect() as connection:
        ticket = connection.execute(
            text("""
                SELECT t.id, t.used_at, o.status
                FROM tickets t
                JOIN orders o ON o.id = t.order_id
                WHERE t.ticket_code = :code
            """),
            {"code": data.ticket_code}
        ).mappings().first()

    if ticket is None:
        return {
            "valid": False,
            "message": "Ticket not found"
        }

    if ticket["status"] != "PAID":
        return {
            "valid": False,
            "message": "Payment not confirmed"
        }

    if ticket["used_at"] is not None:
        return {
            "valid": False,
            "message": "Ticket already used"
        }

    return {
        "valid": True,
        "ticket_id": ticket["id"],
        "message": "Valid ticket"
    }


# ---------------------------------
# CHECK-IN
# ---------------------------------

@app.post("/tickets/check-in")
def check_in_ticket(
    data: TicketVerification,
    _: None = Depends(verify_checkin_key)
):
    with engine.begin() as connection:
        result = connection.execute(
            text("""
                UPDATE tickets t
                JOIN orders o ON o.id = t.order_id
                SET t.used_at = NOW()
                WHERE t.ticket_code = :code
                  AND t.used_at IS NULL
                  AND o.status = 'PAID'
            """),
            {"code": data.ticket_code}
        )

        if result.rowcount == 0:
            return {
                "valid": False,
                "message": "Ticket invalid or already used"
            }

    return {
        "valid": True,
        "message": "Check-in successful"
    }


# ---------------------------------
# TICKET BY ORDER
# ---------------------------------

@app.get("/orders/{order_id}/ticket")
def get_order_ticket(
    order_id: int,
    x_ticket_token: str = Header(...)
):
    with engine.connect() as connection:
        ticket = connection.execute(
            text("""
                SELECT t.id AS ticket_id,
                       t.used_at,
                       o.status
                FROM tickets t
                JOIN orders o ON o.id = t.order_id
                WHERE o.id = :order_id
                  AND o.status = 'PAID'
                  AND o.access_token = :access_token
            """),
            {
                "order_id": order_id,
                "access_token": x_ticket_token
            }
        ).mappings().first()

    if ticket is None:
        raise HTTPException(
            status_code=404,
            detail="Ticket not found or access denied"
        )

    return dict(ticket)
