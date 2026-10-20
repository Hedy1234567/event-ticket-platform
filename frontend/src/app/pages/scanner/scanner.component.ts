
import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';

@Component({
  selector: 'app-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scanner.component.html',
  styleUrl: './scanner.component.css'
})
export class ScannerComponent implements OnDestroy {
  ticketCode = '';
  checkinKey = '';
  message = '';
  scanning = false;
  private controls?: IScannerControls;
  private reader = new BrowserQRCodeReader();

  constructor(private http: HttpClient) {}

  verifyTicket(): void {
    if (!this.ticketCode.trim() || !this.checkinKey.trim()) {
      this.message = 'Enter ticket code and organizer key.';
      return;
    }

    this.http.post<{ valid: boolean; message: string }>(
      'http://127.0.0.1:8001/tickets/verify',
      { ticket_code: this.ticketCode.trim() },
      { headers: { 'X-Checkin-Key': this.checkinKey.trim() } }
    ).subscribe({
      next: (result) => {
        this.message = result.message;
      },
      error: () => {
        this.message = 'Verification failed.';
      }
    });
  }

  checkIn(): void {
    if (!this.ticketCode.trim() || !this.checkinKey.trim()) {
      this.message = 'Enter ticket code and organizer key.';
      return;
    }

    this.http.post<{ valid: boolean; message: string }>(
      'http://127.0.0.1:8001/tickets/check-in',
      { ticket_code: this.ticketCode.trim() },
      { headers: { 'X-Checkin-Key': this.checkinKey.trim() } }
    ).subscribe({
      next: (result) => {
        this.message = result.message;
      },
      error: () => {
        this.message = 'Check-in failed.';
      }
    });
  }

  async startScanner(): Promise<void> {
    try {
      this.message = '';
      this.scanning = true;

      this.controls = await this.reader.decodeFromVideoDevice(
        undefined,
        'scanner-video',
        (result) => {
          if (result) {
            this.ticketCode = result.getText();
            this.stopScanner();
            this.message = 'QR Code scanned. Click Verify Ticket.';
          }
        }
      );
    } catch {
      this.scanning = false;
      this.message = 'Camera unavailable or permission denied.';
    }
  }

  stopScanner(): void {
    this.controls?.stop();
    this.controls = undefined;
    this.scanning = false;
  }

  ngOnDestroy(): void {
    this.stopScanner();
  }
}
