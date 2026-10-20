
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Event {
  id: number;
  name: string;
  price: number;
}

@Injectable({
  providedIn: 'root'
})
export class EventService {

  private http = inject(HttpClient);

  private apiUrl = 'http://127.0.0.1:8001';

  // GET ALL EVENTS
  getEvents(): Observable<Event[]> {
    return this.http.get<Event[]>(
      `${this.apiUrl}/events`
    );
  }

  // CREATE RESERVATION
  createOrder(eventId: number, email: string) {
    return this.http.post<{
      order_id: number;
      status: string;
      message: string;
      access_token: string;
    }>(
      `${this.apiUrl}/orders`,
      {
        event_id: eventId,
        customer_email: email
      }
    );
  }

  // DEMO PAYMENT
  demoPay(orderId: number, accessToken: string) {
    return this.http.post<{
      order_id: number;
      payment: string;
      status: string;
      ticket_id: number;
      message: string;
    }>(
      `${this.apiUrl}/demo/pay/${orderId}`,
      {},
      {
        headers: {
          'X-Ticket-Token': accessToken
        }
      }
    );
  }

  // GET TICKET QR CODE
  getTicketQr(
    ticketId: number,
    accessToken: string
  ): Observable<Blob> {
    return this.http.get(
      `${this.apiUrl}/tickets/${ticketId}/qr`,
      {
        headers: {
          'X-Ticket-Token': accessToken
        },
        responseType: 'blob'
      }
    );
  }

  // GET TICKET FROM ORDER
  getOrderTicket(
    orderId: number,
    accessToken: string
  ) {
    return this.http.get<{
      ticket_id: number;
      used_at: string | null;
      status: string;
    }>(
      `${this.apiUrl}/orders/${orderId}/ticket`,
      {
        headers: {
          'X-Ticket-Token': accessToken
        }
      }
    );
  }
}
