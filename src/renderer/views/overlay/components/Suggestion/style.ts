import styled, { css } from 'styled-components';
import { transparency, BLUE_300 } from '~/renderer/constants';
import { ITheme } from '~/interfaces';
import { centerIcon } from '~/renderer/mixins';

export const StyledSuggestion = styled.div`
  width: 100%;
  height: 38px;
  min-height: 38px;
  display: flex;
  align-items: center;
  overflow: hidden;
  ${({ selected, theme }: { selected: boolean; theme?: ITheme }) => css`
    ${selected
      ? css`
          background-color: ${theme!['searchBox.lightForeground']
            ? 'rgba(255, 255, 255, 0.06)'
            : 'rgba(0, 0, 0, 0.06)'};
        `
      : css`
          &:hover {
            background-color: ${theme!['searchBox.lightForeground']
              ? 'rgba(255, 255, 255, 0.03)'
              : 'rgba(0, 0, 0, 0.03)'};
          }
        `}
  `};
`;

export const SuggestionText = styled.div`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
`;

export const PrimaryText = styled(SuggestionText)`
  opacity: ${transparency.text.high};
`;

export const RightText = styled(SuggestionText)`
  padding-right: 16px;
  flex: 1;
`;

export const Url = styled(RightText)`
  ${({ theme }: { theme?: ITheme }) => css`
    color: ${theme!['searchBox.lightForeground'] ? BLUE_300 : '#3297FD'};
  `}
`;

export const SecondaryText = styled(RightText)`
  opacity: ${transparency.text.medium};
`;

export const Icon = styled.div`
  margin-left: 11px;
  width: 16px;
  min-width: 16px;
  height: 16px;
  margin-right: 12px;
  ${centerIcon()};
`;

export const Dash = styled.div`
  margin-left: 4px;
  margin-right: 4px;
  opacity: ${transparency.text.medium};
`;
