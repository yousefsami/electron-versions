import { URLRow } from './url-row';

export interface IHistoryMatch {
  urlInfo: URLRow;

  // The offset of the user's input within the URL.
  inputLocation: number;

  // Whether there is a match within specific URL components. This is used
  // to prevent hiding the component containing the match. For instance,
  // if our best match was in the scheme, not showing the scheme is both
  // confusing and, for inline autocomplete of the fill_into_edit, dangerous.
  // (If the user types "h" and we match "http://foo/", we need to inline
  // autocomplete that, not "foo/", which won't show anything at all, and
  // will mislead the user into thinking the What You Typed match is what's
  // selected.)
  matchInScheme: boolean;
  matchInSubdomain: boolean;

  // A match after any scheme/"www.", if the user input could match at both
  // locations.  If the user types "w", an innermost match ("website.com") is
  // better than a non-innermost match ("www.google.com").  If the user types
  // "x", no scheme in our prefix list (or "www.") begins with x, so all
  // matches are, vacuously, "innermost matches".
  innermostMatch: boolean;
}
