import { observer } from 'mobx-react-lite';
import * as React from 'react';

import {
  StyledSuggestion,
  PrimaryText,
  Dash,
  SecondaryText,
  Icon,
  Url,
} from './style';
import store from '../../store';
import { IAutocompleteMatch } from '~/browser/services/omnibox/autocomplete-match';

interface Props {
  suggestion: IAutocompleteMatch;
  id: number;
}

const onClick = (suggestion: IAutocompleteMatch) => () => {
  let url = suggestion.destinationUrl; // TODO(sentialx): suggestion.isSearch ? suggestion.primaryText : suggestion.url;

  if (suggestion.isSearch) {
    url = store.omnibox.searchEngine.url.replace('%s', url);
  } else if (url.indexOf('://') === -1) {
    url = `http://${url}`;
  }

  browser.tabs.update(store.tabId, { url });

  store.omnibox.hide();
};

export const Suggestion = observer(({ suggestion, id }: Props) => {
  // const { hovered } = suggestion;
  const { contents, description, favicon } = suggestion;

  const selected = store.omnibox.selectedSuggestionId === id;

  return (
    <StyledSuggestion
      selected={selected}
      hovered={false}
      onClick={onClick(suggestion)}
    >
      <Icon
        style={{
          backgroundImage: `url(${favicon})`,
          // TODO(sentialx):
          // opacity: customFavicon ? 1 : transparency.icons.inactive,
          // filter: !customFavicon
          //   ? store.theme['searchBox.lightForeground']
          //     ? 'invert(100%)'
          //     : 'none'
          //   : 'none',
        }}
      />
      {description && <PrimaryText>{description}</PrimaryText>}
      {description && contents && <Dash>&ndash;</Dash>}
      {contents ? (
        <Url>{contents}</Url>
      ) : (
        <SecondaryText>{contents}</SecondaryText>
      )}
    </StyledSuggestion>
  );
});
