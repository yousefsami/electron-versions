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

const onClick = (id: number) => () => {
  store.omnibox.navigateToURL(id);
};

export const Suggestion = observer(({ suggestion, id }: Props) => {
  const { contents, description, favicon } = suggestion;

  const selected = store.omnibox.selectedSuggestionId === id;

  const onMouseDown = React.useCallback(() => {
    store.omnibox.selectedSuggestionId = id;
  }, [id]);

  return (
    <StyledSuggestion
      selected={selected}
      onMouseDown={onMouseDown}
      onClick={onClick(id)}
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
