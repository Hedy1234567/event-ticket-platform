
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EventService, Event } from '../../services/event.service';

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './events.component.html',
  styleUrl: './events.component.css'
})
export class EventsComponent implements OnInit, OnDestroy {
  events: Event[] = [];
  search = '';
  selectedCategory = 'All';
  loading = true;
  error = '';

  selectedEvent: Event | null = null;
  customerEmail = '';
  booking = false;
  bookingMessage = '';
  bookingError = '';
  paying = false;

  orderId: number | null = null;
  orderAccessToken: string | null = null;
  ticketQrUrl: string | null = null;
  ticketId: number | null = null;

  categories = ['All', 'Music', 'Technology', 'Comedy'];

  constructor(private eventService: EventService) {}

  ngOnInit(): void {
    this.eventService.getEvents().subscribe({
      next: data => {
        this.events = data;
        this.loading = false;
      },
      error: () => {
        this.error = 'Unable to load events. Please try again.';
        this.loading = false;
      }
    });
  }

  get filteredEvents(): Event[] {
    return this.events.filter(event => {
      const matchesSearch = event.name
        .toLowerCase()
        .includes(this.search.toLowerCase());

      const matchesCategory =
        this.selectedCategory === 'All' ||
        this.getCategory(event) === this.selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }

  getCategory(event: Event): string {
    const name = event.name.toLowerCase();

    if (name.includes('music') || name.includes('concert')) {
      return 'Music';
    }

    if (name.includes('tech') || name.includes('conference')) {
      return 'Technology';
    }

    if (name.includes('comedy')) {
      return 'Comedy';
    }

    return 'Other';
  }

  getEventImage(event: Event): string {
    switch (this.getCategory(event)) {
      case 'Music':
        return 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=1200&q=85';

      case 'Technology':
        return 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=85';

      case 'Comedy':
        return 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&q=85';

      default:
        return 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&q=85';
    }
  }

  openBooking(event: Event): void {
    this.selectedEvent = event;
    this.customerEmail = '';
    this.bookingMessage = '';
    this.bookingError = '';
  }

  closeBooking(): void {
    if (!this.booking) {
      this.selectedEvent = null;
    }
  }

  bookTicket(): void {
    if (!this.selectedEvent || this.booking) return;

    const email = this.customerEmail.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.bookingError = 'Please enter a valid email address.';
      return;
    }

    this.booking = true;
    this.bookingError = '';

    const eventName = this.selectedEvent.name;

    this.eventService.createOrder(
      this.selectedEvent.id,
      email
    ).subscribe({
      next: response => {
        this.clearTicket();

        this.orderId = response.order_id;
        this.orderAccessToken = response.access_token;

        this.bookingMessage =
          `Reservation #${response.order_id} created for ${eventName}. Payment is pending.`;

        this.booking = false;
        this.selectedEvent = null;
      },
      error: () => {
        this.bookingError = 'Reservation failed. Please try again.';
        this.booking = false;
      }
    });
  }

  payDemo(): void {
    if (
      this.orderId === null ||
      !this.orderAccessToken ||
      this.paying
    ) {
      return;
    }

    this.paying = true;
    this.bookingError = '';

    this.eventService.demoPay(
      this.orderId,
      this.orderAccessToken
    ).subscribe({
      next: result => {
        this.paying = false;

        if (result.status === 'PAID') {
          this.bookingMessage =
            'Demo payment successful! Your ticket is ready.';

          this.viewMyTicket();
        } else {
          this.bookingError =
            'Demo payment was not completed.';
        }
      },
      error: () => {
        this.paying = false;
        this.bookingError =
          'Demo payment failed. Please try again.';
      }
    });
  }

  viewMyTicket(): void {
    if (this.orderId === null || !this.orderAccessToken) {
      return;
    }

    this.bookingError = '';

    this.eventService.getOrderTicket(
      this.orderId,
      this.orderAccessToken
    ).subscribe({
      next: ticket => {
        this.showTicketQr(
          ticket.ticket_id,
          this.orderAccessToken!
        );
      },
      error: () => {
        this.bookingError =
          'Ticket unavailable. Your reservation must be paid first.';
      }
    });
  }

  showTicketQr(ticketId: number, accessToken: string): void {
    this.eventService.getTicketQr(
      ticketId,
      accessToken
    ).subscribe({
      next: imageBlob => {
        this.clearTicket();

        this.ticketQrUrl =
          URL.createObjectURL(imageBlob);

        this.ticketId = ticketId;
      },
      error: () => {
        this.bookingError =
          'Unable to load ticket QR code.';
      }
    });
  }

  clearTicket(): void {
    if (this.ticketQrUrl) {
      URL.revokeObjectURL(this.ticketQrUrl);
    }

    this.ticketQrUrl = null;
    this.ticketId = null;
  }

  scrollToEvents(): void {
    document.getElementById('events')?.scrollIntoView({
      behavior: 'smooth'
    });
  }

  ngOnDestroy(): void {
    this.clearTicket();
  }
}
