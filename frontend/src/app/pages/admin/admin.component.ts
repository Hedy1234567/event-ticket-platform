
import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';

import {
  AdminService,
  AdminStats,
  AdminEvent,
  AdminOrder,
  AdminTicket,
  EventPayload
} from '../../services/admin.service';

type Tab = 'overview' | 'events' | 'orders' | 'tickets';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css'
})
export class AdminComponent implements OnDestroy {
  username = 'admin';
  password = '';
  loginBusy = false;
  busy = false;
  saving = false;
  error = '';
  notice = '';

  activeTab: Tab = 'overview';

  stats: AdminStats | null = null;
  events: AdminEvent[] = [];
  orders: AdminOrder[] = [];
  tickets: AdminTicket[] = [];

  showForm = false;
  editingId: number | null = null;

  form: EventPayload = this.emptyForm();

  constructor(public admin: AdminService) {}

  private emptyForm(): EventPayload {
    return {
      name: '',
      description: '',
      location: '',
      event_date: '',
      price: 0
    };
  }

  login(): void {
    if (this.loginBusy) return;

    this.loginBusy = true;
    this.error = '';

    this.admin.login(
      this.username.trim(),
      this.password
    ).subscribe({
      next: response => {
        this.admin.setToken(response.access_token);
        this.password = '';
        this.loginBusy = false;
        this.refresh();
      },
      error: () => {
        this.error = 'Invalid credentials or backend unavailable.';
        this.loginBusy = false;
      }
    });
  }

  logout(): void {
    this.admin.logout();
    this.stats = null;
    this.events = [];
    this.orders = [];
    this.tickets = [];
    this.password = '';
    this.showForm = false;
    this.error = '';
    this.notice = '';
  }

  refresh(): void {
    this.busy = true;
    this.error = '';

    forkJoin({
      stats: this.admin.stats(),
      events: this.admin.events(),
      orders: this.admin.orders(),
      tickets: this.admin.tickets()
    }).subscribe({
      next: result => {
        this.stats = result.stats;
        this.events = result.events;
        this.orders = result.orders;
        this.tickets = result.tickets;
        this.busy = false;
      },
      error: (err: HttpErrorResponse) => {
        this.busy = false;

        if (err.status === 401 || err.status === 403) {
          this.logout();
          this.error = 'Session expired. Please log in again.';
        } else {
          this.error = 'Could not load dashboard data.';
        }
      }
    });
  }

  setTab(tab: Tab): void {
    this.activeTab = tab;
    this.error = '';
    this.notice = '';
  }

  newEvent(): void {
    this.editingId = null;
    this.form = this.emptyForm();
    this.showForm = true;
    this.error = '';
  }

  editEvent(event: AdminEvent): void {
    this.editingId = event.id;
    this.form = {
      name: event.name,
      description: event.description || '',
      location: event.location,
      event_date: event.event_date.slice(0, 16),
      price: Number(event.price)
    };
    this.showForm = true;
    this.error = '';
  }

  saveEvent(): void {
    if (this.saving) return;

    this.saving = true;
    this.error = '';

    const payload: EventPayload = {
      name: this.form.name.trim(),
      description: this.form.description?.trim() || null,
      location: this.form.location.trim(),
      event_date: this.form.event_date.length === 16
        ? this.form.event_date + ':00'
        : this.form.event_date,
      price: Number(this.form.price)
    };

    const request = this.editingId === null
      ? this.admin.createEvent(payload)
      : this.admin.updateEvent(this.editingId, payload);

    request.subscribe({
      next: () => {
        this.saving = false;
        this.showForm = false;
        this.refresh();
        this.notice = 'Event saved successfully.';
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.error = typeof err.error?.detail === 'string'
          ? err.error.detail
          : 'Could not save event.';
      }
    });
  }

  deleteEvent(event: AdminEvent): void {
    if (!confirm(`Delete "${event.name}"?`)) return;

    this.admin.deleteEvent(event.id).subscribe({
      next: () => {
        this.refresh();
        this.notice = 'Event deleted.';
      },
      error: (err: HttpErrorResponse) => {
        this.error = typeof err.error?.detail === 'string'
          ? err.error.detail
          : 'Could not delete event.';
      }
    });
  }

  ngOnDestroy(): void {
    this.admin.logout();
  }
}
