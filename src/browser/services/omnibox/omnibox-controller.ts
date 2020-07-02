import { ipcMain } from 'electron';
import { Application } from '../../application';
import { IAutocompleteProvider } from './autocomplete-provider';
import { HistoryURLProvider } from './history-url-provider';
import { IAutocompleteMatch } from './autocomplete-match';
import { IAutocompleteInput, AutocompleteInput } from './autocomplete-input';
import { AutocompleteSchemeClassifier } from './autocomplete-classifier';

export class OmniboxController {
  private providers: IAutocompleteProvider[] = [];

  constructor() {
    this.providers.push(new HistoryURLProvider());

    const schemeClassifier = new AutocompleteSchemeClassifier();

    ipcMain.on('omnibox-input-begin', (e, data) => {
      const overlay = Application.instance.overlay.fromWebContents(e.sender);
      overlay.win.focus();
      overlay.send('omnibox-input', data);
    });

    ipcMain.handle(
      'omnibox-input-changed',
      (e, text, cursorPosition, justRemoved) => {
        const input = AutocompleteInput.init(
          {
            text,
            cursorPosition,
          },
          schemeClassifier,
        );
        input.preventInlineAutocomplete = justRemoved;
        return this.start(input);
      },
    );

    ipcMain.on(`omnibox-update-input`, (e, data) => {
      const window = Application.instance.windows.fromWebContents(e.sender);

      window.win.focus();

      window.send('addressbar-update-input', data);
    });
  }

  public async start(input: IAutocompleteInput): Promise<IAutocompleteMatch[]> {
    if (input.text.trim() === '') return [];

    const matches = [];

    for (const provider of this.providers) {
      matches.push(...(await provider.start(input)));
    }

    return matches;
  }
}
