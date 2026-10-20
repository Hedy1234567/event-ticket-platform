
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

export interface AdminStats {
  total_events: number;
  total_orders: number;
  paid_orders: number;
  tickets_issued: number;
  tickets_checked_in: number;
  demo_revenue_tnd: number;
}

export interface AdminEvent {
  id: number;
  name: string;
  description: string | null;
  location: string;
  event_date: string;
  price: number;
}

export type EventPayload = Omit<AdminEvent, 'id'>;

export interface AdminOrder {
  id: number;
  event_id: number;
  event_name: string;
  customer_email: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface AdminTicket {
  id: number;
  order_id: number;
  event_id: number;
  event_name: string;
  customer_email: string;
  created_at: string;
  used_at: string | null;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  private api = 'http://127.0.0.1:8001/admin';
  private token: string | null = null;

  get isLoggedIn(): boolean {
    return !!this.token;
  }

  login(username: string, password: string) {
    return this.http.post<{
      access_token: string;
      token_type: string;
    }>(`${this.api}/login`, { username, password });
  }

  setToken(token: string): void {
    this.token = token;
  }

  logout(): void {
    this.token = null;
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.token || ''}`
    });
  }

  stats() {
    return this.http.get<AdminStats>(
      `${this.api}/stats`,
      { headers: this.headers() }
    );
  }

  events() {
    return this.http.get<AdminEvent[]>(
      `${this.api}/events`,
      { headers: this.headers() }
    );
  }

  orders() {
    return this.http.get<AdminOrder[]>(
      `${this.api}/orders`,
      { headers: this.headers() }
    );
  }

  tickets() {
    return this.http.get<AdminTicket[]>(
      `${this.api}/tickets`,
      { headers: this.headers() }
    );
  }

  createEvent(data: EventPayload) {
    return this.http.post(
      `${this.api}/events`,
      data,
      { headers: this.headers() }
    );
  }

  updateEvent(id: number, data: EventPayload) {
    return this.http.put(
      `${this.api}/events/${id}`,
      data,
      { headers: this.headers() }
    );
  }

  deleteEvent(id: number) {
    return this.http.delete(
      `${this.api}/events/${id}`,
      { headers: this.headers() }
    );
  }
}
