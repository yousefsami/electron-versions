export interface IAutocompleteMatch {
  // The URL to actually load when the autocomplete item is selected. This URL
  // should be canonical so we can compare URLs with strcmp to avoid dupes.
  // It may be empty if there is no possible navigation.
  destinationUrl: string;

  // Additional helper text for each entry, such as a title or description.
  description?: string;

  // This string is loaded into the location bar when the item is selected
  // by pressing the arrow keys. This may be different than a URL, for example,
  // for search suggestions, this would just be the search terms.
  fillIntoEdit: string;

  // The main text displayed in the address bar dropdown.
  contents?: string;

  // The relevance of this match. See table in autocomplete.h for scores
  // returned by various providers. This is used to rank matches among all
  // responding providers, so different providers must be carefully tuned to
  // supply matches with appropriate relevance.
  relevance: number;

  // How many times this result was typed in / selected from the omnibox.
  // Only set for some providers and result_types.  If it is not set,
  // its value is -1.  At the time of writing this comment, it is only
  // set for matches from HistoryURL and HistoryQuickProvider.
  typedCount: number;

  // True if the user should be able to delete this match.
  deletable: boolean;

  allowedToBeDefaultMatch: boolean;

  inlineAutocompletion: string;

  favicon?: string;
}

export const parsePossiblyInvalidURL = (url: string) => {
  try {
    return new URL(url);
  } catch (e) {
    if (url.indexOf(' ') !== -1) return {} as URL;
    else return new URL(`empty://${url}`);
  }
};

export const getMatchComponents = (url: string, matchPositions: number[][]) => {
  const parsed = parsePossiblyInvalidURL(url);

  let matchInScheme = false;
  let matchInSubdomain = false;

  const split = parsed.hostname.split('.');
  const domain = split.length > 2 ? split[1] + split[2] : split[0] + split[1];

  const hostPos = url.indexOf(parsed.hostname);

  const hasSubdomain =
    domain.length > 0 && domain.length < parsed.hostname.length;

  // Subtract an extra character from the domain start to exclude the '.'
  // delimiter between subdomain and domain.
  const subdomainEnd = hasSubdomain
    ? hostPos + parsed.hostname.length - domain.length - 1
    : -1;

  for (const position of matchPositions) {
    if (position[0] === 0 && parsed.protocol !== 'empty:') matchInScheme = true;

    // Subdomain matches must begin before the domain, and end somewhere within
    // the host or later.
    if (
      hasSubdomain &&
      position[0] < subdomainEnd &&
      position[1] > hostPos &&
      parsed.hostname !== 'empty:'
    )
      matchInSubdomain = true;
  }

  return {
    matchInScheme,
    matchInSubdomain,
  };
};
