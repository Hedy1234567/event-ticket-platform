
import { Routes } from '@angular/router';
import { EventsComponent } from './pages/events/events.component';

export const routes: Routes = [
  {
    path: '',
    component: EventsComponent,
    pathMatch: 'full'
  },
  {
    path: 'scanner',
    loadComponent: () =>
      import('./pages/scanner/scanner.component')
        .then(m => m.ScannerComponent)
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./pages/admin/admin.component')
        .then(m => m.AdminComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
