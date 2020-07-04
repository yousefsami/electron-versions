import * as React from 'react';
import { observer } from 'mobx-react-lite';

import { Input, CurrentIcon, SearchBox, StyledOmnibox } from './style';
import { Suggestions } from '../Suggestions';
import store from '../../store';
import { IAutocompleteMatch } from '~/browser/services/omnibox/autocomplete-match';

const onKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.which === 13) {
    // Enter.
    e.preventDefault();
    store.omnibox.navigateToURL(store.omnibox.selectedSuggestionId);
  }
};

const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  const input = store.omnibox.inputRef.current;

  if (!input) return console.error();

  if (e.key === 'Escape') {
    store.omnibox.hide({ focus: true, escape: true });
  } else if (e.keyCode === 38 /* Up */ || e.keyCode === 40 /* Down */) {
    e.preventDefault();
    store.omnibox.selectedSuggestionId += e.keyCode === 40 ? 1 : -1;
  }
};

let prevSuggestion = '';

const onInput = async (e: any) => {
  const text = e.currentTarget.value;
  const start = e.currentTarget.selectionStart;

  // TODO(sentialx): selecting text and typing a letter also is being treated as removing text.
  const removed = text.length <= store.omnibox.inputText.length;

  store.omnibox.inputText = text;

  if (!removed) store.omnibox.autoComplete(prevSuggestion.substr(1));

  if (text.trim() === '') {
    store.omnibox.hide({ focus: true });
  }

  const matches: IAutocompleteMatch[] = await browser.ipcRenderer.invoke(
    'omnibox-input-changed',
    text,
    start,
    removed,
  );

  const match = matches[0];
  if (match && match.allowedToBeDefaultMatch) {
    if (!match.inlineAutocompletion) return console.error();
    store.omnibox.autoComplete(match.inlineAutocompletion);
    prevSuggestion = match.inlineAutocompletion;
  } else {
    prevSuggestion = '';
    store.omnibox.autoComplete('');
  }

  store.omnibox.suggestions = matches;
  store.omnibox.resetSelectedSuggestion();
};

export const Omnibox = observer(() => {
  let timeout: any;

  const ref = React.useRef<HTMLDivElement>();

  const region = store.getRegion('omnibox');
  const suggestionsVisible = store.omnibox.suggestions.length !== 0;

  const onBlur = React.useCallback(() => {
    timeout = setTimeout(() => {
      store.omnibox.hide();
    });
  }, []);

  const onFocus = React.useCallback(() => {
    clearTimeout(timeout);
  }, []);

  requestAnimationFrame(() => {
    if (!ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    store.updateRegion('omnibox', {
      left: store.omnibox.x,
      top: store.omnibox.y,
      width,
      height,
      visible: store.omnibox.visible,
    });
  });

  const suggestion = store.omnibox.selectedSuggestion;

  const favicon = suggestion?.favicon ?? '';

  return (
    <StyledOmnibox
      ref={ref as any}
      tabIndex={0}
      style={{ left: region.left, top: region.top, width: store.omnibox.width }}
      onBlur={onBlur}
      onFocus={onFocus}
      visible={store.omnibox.visible}
    >
      <SearchBox>
        <CurrentIcon
          style={{
            backgroundImage: `url(${favicon})`,
            // filter:
            //   customIcon && store.theme['dialog.lightForeground']
            //     ? 'invert(100%)'
            //     : 'none',
            // opacity: customIcon ? 0.54 : 1,
          }}
        ></CurrentIcon>
        <Input
          onKeyDown={onKeyDown}
          onInput={onInput}
          ref={store.omnibox.inputRef}
          onKeyPress={onKeyPress}
        ></Input>
      </SearchBox>
      <Suggestions visible={suggestionsVisible}></Suggestions>
    </StyledOmnibox>
  );
});
