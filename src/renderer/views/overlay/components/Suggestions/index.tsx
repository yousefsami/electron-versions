import { observer } from 'mobx-react-lite';
import * as React from 'react';

import { StyledSuggestions } from './style';
import { Suggestion } from '../Suggestion';
import store from '../../store';

interface Props {
  visible: boolean;
}

export const Suggestions = observer(({ visible }: Props) => {
  return (
    <StyledSuggestions visible={visible}>
      {store.omnibox.suggestions.map((suggestion, key) => (
        <Suggestion suggestion={suggestion} key={key} id={key} />
      ))}
    </StyledSuggestions>
  );
});
