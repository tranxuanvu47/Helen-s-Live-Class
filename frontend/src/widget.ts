import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { importProvidersFrom } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import {
  StreamChatModule,
  StreamAutocompleteTextareaModule,
} from 'stream-chat-angular';

import { ChatWidgetComponent } from './widget/chat-widget.component';

(async () => {
  const app = await createApplication({
    providers: [
      provideHttpClient(),
      provideAnimations(),
      importProvidersFrom(
        TranslateModule.forRoot(),
        StreamChatModule,
        StreamAutocompleteTextareaModule,
      ),
    ],
  });

  const ChatWidgetElement = createCustomElement(ChatWidgetComponent, {
    injector: app.injector,
  });

  customElements.define('stream-chat-widget', ChatWidgetElement);
})();
