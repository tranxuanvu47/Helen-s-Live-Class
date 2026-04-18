import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { StreamI18nService } from 'stream-chat-angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
        width: 100vw;
      }
    `,
  ],
})
export class AppComponent implements OnInit {
  constructor(private i18nService: StreamI18nService) {}

  ngOnInit(): void {
    this.i18nService.setTranslation();
  }
}
