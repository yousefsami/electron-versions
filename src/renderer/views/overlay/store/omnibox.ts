import * as React from 'react';

import { observable, computed } from 'mobx';
import store from '.';
import { IAutocompleteMatch } from '~/browser/services/omnibox/autocomplete-match';

interface ISearchTab {
  id?: number;
  title?: string;
  url?: string;
  favicon?: string;
}

export class OmniboxStore {
  @observable
  public x = 0;

  @observable
  public y = 0;

  @observable
  public width = 0;

  @observable
  public visible = false;

  @observable
  public inputText = '';

  @observable
  public suggestions: IAutocompleteMatch[] = [];

  @observable
  private _selectedSuggestionId = 0;

  @computed
  public get selectedSuggestion() {
    if (this.selectedSuggestionId > this.suggestions.length - 1) return null;
    return this.suggestions[this.selectedSuggestionId];
  }

  @computed
  public get selectedSuggestionId() {
    return this._selectedSuggestionId;
  }

  public set selectedSuggestionId(value: number) {
    if (value > this.suggestions.length - 1) value = 0;
    if (value < 0) value = this.suggestions.length - 1;

    if (this._selectedSuggestionId === value) return;

    this._selectedSuggestionId = value;

    const item = this.selectedSuggestion;
    if (!this.inputRef.current) {
      console.error();
      return;
    }

    this.inputRef.current.value = item?.fillIntoEdit ?? '';
  }

  public resetSelectedSuggestion() {
    this._selectedSuggestionId = 0;
  }

  public canSuggest = false;

  public inputRef = React.createRef<HTMLInputElement>();

  public constructor() {
    browser.ipcRenderer.on('omnibox-input', (e, data) => {
      this.x = data.x;
      this.y = data.y;
      this.width = data.width;

      this.visible = true;

      store.tabId = data.id;

      this.canSuggest = this.inputText.length <= data.text.length;

      if (this.inputRef.current) {
        this.inputRef.current.value = data.text;
        this.inputRef.current.focus();

        this.inputRef.current.setSelectionRange(data.cursorPos, data.cursorPos);

        const event = new Event('input', { bubbles: true });
        this.inputRef.current.dispatchEvent(event);
      }
    });
  }

  public autoComplete(text: string) {
    const input = this.inputRef.current;
    if (!input) return;

    const start = input.selectionStart ?? 0;
    input.value = input.value.substr(0, start) + text;

    input.setSelectionRange(start, input.value.length);
  }

  public hide(data: { focus?: boolean; escape?: boolean } = {}) {
    if (!this.visible || !this.inputRef.current) return;

    browser.ipcRenderer.send(`omnibox-update-input`, {
      id: store.tabId,
      text: this.inputRef.current.value,
      selectionStart: this.inputRef.current.selectionStart,
      selectionEnd: this.inputRef.current.selectionEnd,
      ...data,
    });

    this.visible = false;
    this.inputText = '';
    this.inputRef.current.value = '';
    this.suggestions = [];
  }

  public navigateToURL = (suggestionId: number) => {
    if (!this.inputRef.current) return console.error();

    browser.ipcRenderer.invoke(
      'omnibox-enter-pressed',
      this.inputRef.current.value,
      suggestionId,
    );

    store.omnibox.hide();
  };
}
