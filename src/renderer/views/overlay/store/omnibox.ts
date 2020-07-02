import * as React from 'react';

import { observable, computed } from 'mobx';
import { ISuggestion, IVisitedItem } from '~/interfaces';
import store from '.';

let lastSuggestion: string;

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
  public visitedItems: IVisitedItem[] = [];

  @observable
  public tabs: ISearchTab[] = [];

  @observable
  public inputText = '';

  private textWithoutAutocompletion = '';

  @computed
  public get searchedTabs(): ISuggestion[] {
    const lastItem = store.suggestions.list[store.suggestions.list.length - 1];

    let id = 0;

    if (lastItem) {
      id = lastItem.id + 1;
    }

    return this.tabs
      .filter(
        (tab) =>
          tab.title.indexOf(this.inputText) !== -1 ||
          tab.url.indexOf(this.inputText) !== -1,
      )
      .map((tab) => ({
        primaryText: tab.url,
        secondaryText: tab.title,
        id: id++,
        favicon: tab.favicon,
      }))
      .slice(0, 3);
  }

  @computed
  public get searchEngine() {
    return store.settings.searchEngines[store.settings.searchEngine];
  }

  public canSuggest = false;

  public inputRef = React.createRef<HTMLInputElement>();

  public constructor() {
    browser.ipcRenderer.on('omnibox-input', (e, data) => {
      this.x = data.x;
      this.y = data.y;
      this.width = data.width;

      this.visible = true;

      this.tabs = [];
      store.tabId = data.id;

      this.canSuggest = this.inputText.length <= data.text.length;

      this.inputRef.current.value = data.text;
      this.inputRef.current.focus();

      this.inputRef.current.setSelectionRange(data.cursorPos, data.cursorPos);

      const event = new Event('input', { bubbles: true });
      this.inputRef.current.dispatchEvent(event);
    });

    browser.ipcRenderer.on('search-tabs', (e, tabs) => {
      this.tabs = tabs;
    });

    // this.loadHistory();
  }

  public autoComplete(text: string) {
    const input = this.inputRef.current;

    const start = input.selectionStart;
    input.value = input.value.substr(0, input.selectionStart) + text;

    input.setSelectionRange(start, input.value.length);
  }

  public hide(data: { focus?: boolean; escape?: boolean } = {}) {
    if (!this.visible) return;

    browser.ipcRenderer.send(`omnibox-update-input`, {
      id: store.tabId,
      text: this.inputRef.current.value,
      selectionStart: this.inputRef.current.selectionStart,
      selectionEnd: this.inputRef.current.selectionEnd,
      ...data,
    });

    this.visible = false;
    this.tabs = [];
    this.inputText = '';
    this.inputRef.current.value = '';
    store.suggestions.list = [];
  }
}
