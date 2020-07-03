import { IAutocompleteSchemeClassifier } from './autocomplete-classifier';
import {
  isStringAValidURL,
  isNonEmpty,
  numNonHostComponents,
} from './history-url-provider';

import * as ip from 'is-ip';
import { parsePossiblyInvalidURL } from './autocomplete-match';

// The type of page currently displayed when the user used the omnibox.
enum PageClassification {
  // An invalid URL; shouldn't happen.
  INVALID_SPEC = 0,

  // chrome://newtab/.  This can be either the built-in version or a
  // replacement new tab page from an extension.  Note that when Instant
  // Extended is enabled, the new tab page will be reported as either
  // INSTANT_NTP_WITH_OMNIBOX_AS_STARTING_FOCUS or
  // INSTANT_NTP_WITH_FAKEBOX_AS_STARTING_FOCUS below,
  // unless an extension is replacing the new tab page, in which case
  // it will still be reported as NTP.
  NTP = 1,

  // about:blank.
  BLANK = 2,

  // The user's home page.  Note that if the home page is set to any
  // of the new tab page versions or to about:blank, then we'll
  // classify the page into those categories, not HOME_PAGE.
  HOME_PAGE = 3,

  // The catch-all entry of everything not included somewhere else
  // on this list.
  OTHER = 4,

  // The instant new tab page enum value was deprecated on August 2, 2013.
  OBSOLETE_INSTANT_NTP = 5,

  // The user is on a search result page that does search term replacement.
  // This means the search terms are shown in the omnibox instead of the URL.
  // In other words: Query in Omnibox is Active for this SRP.
  SEARCH_RESULT_PAGE_DOING_SEARCH_TERM_REPLACEMENT = 6,

  // The new tab page in which this omnibox interaction first started
  // with the user having focus in the omnibox.
  INSTANT_NTP_WITH_OMNIBOX_AS_STARTING_FOCUS = 7,

  // The new tab page in which this omnibox interaction first started
  // with the user having focus in the fakebox.
  INSTANT_NTP_WITH_FAKEBOX_AS_STARTING_FOCUS = 8,

  // The user is on a search result page that does not do search term
  // replacement. This means the URL of the SRP is shown in the omnibox.
  // In other words: Query in Omnibox is Inactive for this SRP.
  SEARCH_RESULT_PAGE_NO_SEARCH_TERM_REPLACEMENT = 9,

  // The user is on the home screen.
  APP_HOME = 10,

  // The user is in the search app.
  APP_SEARCH = 11,

  // The user is in the maps app.
  APP_MAPS = 12,

  // This omnibox interaction started with the user tapping the search button.
  SEARCH_BUTTON_AS_STARTING_FOCUS = 13,

  // This interaction started with the user focusing or typing in the search
  // box of the ChromeOS app list (a.k.a., launcher).
  CHROMEOS_APP_LIST = 14,

  // The new tab page in which this omnibox interaction started with the user
  // having focus in the realbox.
  NTP_REALBOX = 15,

  // When adding new classifications, please consider adding them in
  // chromium's chrome/browser/resources/omnibox/omnibox.html
  // so that these new options are displayed on about:omnibox.
}

export enum OmniboxInputType {
  // Empty input
  EMPTY = 0,

  // Valid input whose type cannot be determined
  UNKNOWN = 1,

  // DEPRECATED. Input autodetected as UNKNOWN, which the user wants to treat
  // as an URL by specifying a desired_tld.
  DEPRECATED_REQUESTED_URL = 2,

  // Input autodetected as a URL
  URL = 3,

  // Input autodetected as a query
  QUERY = 4,

  // DEPRECATED. Input forced to be a query by an initial '?'
  DEPRECATED_FORCED_QUERY = 5,
}

// How the Omnibox got into keyword mode. Not present if not in keyword
// mode.
enum KeywordModeEntryMethod {
  INVALID = 0,
  TAB = 1, // Select a suggestion that provides a keyword hint
  // and press Tab.
  SPACE_AT_END = 2, // Type a complete keyword and press Space.
  SPACE_IN_MIDDLE = 3, // Press Space in the middle of an input in order to
  // separate it into a keyword and other text.
  KEYBOARD_SHORTCUT = 4, // Press ^K.
  QUESTION_MARK = 5, // Press Question-mark without any other input.
  CLICK_HINT_VIEW = 6, // Select a suggestion that provides a keyword hint
  // and click the reminder that one can press Tab.
  TAP_HINT_VIEW = 7, // Select a suggestion that provides a keyword hint
  // and touch the reminder that one can press Tab.
  SELECT_SUGGESTION = 8, // Select a keyword suggestion, such as by arrowing
  // or tabbing to it.
}

export interface IAutocompleteInput {
  cursorPosition: number;
  currentPageClassification: PageClassification;
  type: OmniboxInputType;
  preventInlineAutocomplete: boolean;
  preferKeyword: boolean;
  allowExactKeywordMatch: boolean;
  keywordModeEntryMethod: KeywordModeEntryMethod;
  wantAsynchronousMatches: boolean;
  fromOmniboxFocus: boolean;
  text: string;
  desiredTld: string;
  termsPrefixedByHttpOrHttps: string[];
  currentTitle: string;
  scheme: string;
  canonicalizedUrl: string;
  url: URL;
}

enum HostnameFamily {
  IPV6 = 6,
  IPV4 = 4,
  NEUTRAL = 0,
}

const getHostnameFamily = (str: string): HostnameFamily => {
  return ip.version(str) ?? 0;
};

export class AutocompleteInput {
  private static adjustCursorPositionIfNecessary(
    leadingCharsRemoved: number,
    cursorPosition: number,
  ): number {
    if (cursorPosition == -1) return -1;

    if (leadingCharsRemoved < cursorPosition)
      return cursorPosition - leadingCharsRemoved;

    return 0;
  }

  public static init(
    options: Partial<IAutocompleteInput>,
    schemeClassifier?: IAutocompleteSchemeClassifier,
  ): IAutocompleteInput {
    let input: IAutocompleteInput = Object.assign(
      {
        text: '',
        desiredTld: '',
        cursorPosition: -1,
        currentPageClassification: PageClassification.INVALID_SPEC,
        type: OmniboxInputType.EMPTY,
        preventInlineAutocomplete: false,
        preferKeyword: false,
        allowExactKeywordMatch: true,
        keywordModeEntryMethod: KeywordModeEntryMethod.INVALID,
        wantAsynchronousMatches: true,
        fromOmniboxFocus: false,
        termsPrefixedByHttpOrHttps: [],
        currentTitle: '',
        scheme: '',
        canonicalizedUrl: '',
      },
      options as any,
    );

    // None of the providers care about leading white space so we always trim it.
    // Providers that care about trailing white space handle trimming themselves.
    const trimmed = input.text.trimStart();
    if (input.text !== trimmed) {
      input.cursorPosition = AutocompleteInput.adjustCursorPositionIfNecessary(
        input.text.length - trimmed.length,
        input.cursorPosition,
      );
      input.text = trimmed;
    }

    if (!schemeClassifier) return input;

    input = {
      ...input,
      ...AutocompleteInput.parse(schemeClassifier, input.text),
    };

    return input;
  }

  public static parse(
    schemeClassifier: IAutocompleteSchemeClassifier,
    text: string,
    desiredTld?: string,
  ) {
    const result: Pick<
      IAutocompleteInput,
      'type' | 'canonicalizedUrl' | 'url' | 'scheme'
    > = {
      type: OmniboxInputType.UNKNOWN,
      canonicalizedUrl: null!,
      url: null!,
      scheme: null!,
    };

    if (text.trim() === '') {
      result.type = OmniboxInputType.EMPTY;
      return result; // All whitespace.
    }

    const hasKnownTld = text.indexOf('.') !== -1;
    // Ask our parsing back-end to help us understand what the user typed.  We
    // use the URLFixerUpper here because we want to be smart about what we
    // consider a scheme.  For example, we shouldn't consider www.google.com:80
    // to have a scheme.
    result.url = parsePossiblyInvalidURL(text);
    result.canonicalizedUrl = result.url.href;

    if (result.url.protocol === 'empty:') {
      const newUrl = new URL(result.url.href);
      newUrl.protocol = 'http:';
      result.canonicalizedUrl = newUrl.href;
    }

    result.scheme = result.url.protocol;

    // If we can't canonicalize the user's input, the rest of the autocomplete
    // system isn't going to be able to produce a navigable URL match for it.
    // So we just return QUERY immediately in these cases.
    // input.canonicalizedUrl = input.text; // TODO(sentialx): FixupURL()

    if (!isStringAValidURL(result.canonicalizedUrl)) {
      result.type = OmniboxInputType.QUERY;
      return result;
    }

    if (result.url.protocol === 'file:') {
      // A user might or might not type a scheme when entering a file URL.  In
      // either case, |parsed_scheme_utf8| will tell us that this is a file URL,
      // but |parts->scheme| might be empty, e.g. if the user typed "C:\foo".
      result.type = OmniboxInputType.URL;
      return result;
    }

    // Treat javascript: scheme queries followed by things that are unlikely to
    // be code as UNKNOWN, rather than script to execute (URL).
    if (text.match(/javascript:([^;=().\"]*)/)) {
      result.type = OmniboxInputType.UNKNOWN;
      return result;
    }

    // If the user typed a scheme, and it's HTTP or HTTPS, we know how to parse it
    // well enough that we can fall through to the heuristics below.  If it's
    // something else, we can just determine our action based on what we do with
    // any input of this scheme.  In theory we could do better with some schemes
    // (e.g. "ftp" or "view-source") but I'll wait to spend the effort on that
    // until I run into some cases that really need it.
    if (
      isNonEmpty(result.url.protocol) &&
      result.url.protocol !== 'http' &&
      result.url.protocol !== 'https'
    ) {
      const type = schemeClassifier.getInputTypeForScheme(result.url.protocol);
      if (type !== OmniboxInputType.EMPTY) {
        result.type = type;
        return result;
      }

      // We don't know about this scheme.  It might be that the user typed a
      // URL of the form "username:password@foo.com".
      const httpSchemePrefix = `http://`;
      const {
        type: httpType,
        scheme: httpScheme,
        url: httpUrl,
        canonicalizedUrl: httpCanonicalizedUrl,
      } = AutocompleteInput.parse(
        schemeClassifier,
        httpSchemePrefix + text,
        desiredTld,
      );

      if (httpScheme !== 'http') throw new Error();

      if (
        httpType === OmniboxInputType.URL &&
        isNonEmpty(httpUrl.username) &&
        isNonEmpty(httpUrl.password)
      ) {
        // Manually re-jigger the parsed parts to match |text| (without the
        // http scheme added).
        result.url.protocol = '';
        const components = [
          httpUrl.username,
          httpUrl.password,
          httpUrl.hostname,
          httpUrl.port,
          httpUrl.pathname,
          httpUrl.search,
          httpUrl.href,
        ];

        // TODO(sentialx):
        for (const component of components) {
        }

        return {
          url: httpUrl,
          scheme: '',
          canonicalizedUrl: httpCanonicalizedUrl,
          type: OmniboxInputType.URL,
        };
      }

      // We don't know about this scheme and it doesn't look like the user
      // typed a username and password.  It's likely to be a search operator
      // like "site:" or "link:".  We classify it as UNKNOWN so the user has
      // the option of treating it as a URL if we're wrong.
      // Note that SegmentURL() is smart so we aren't tricked by "c:\foo" or
      // "www.example.com:81" in this case.
      result.type = OmniboxInputType.UNKNOWN;
      return result;
    }

    const hostnameFamily = getHostnameFamily(result.url.hostname);

    // Either the user didn't type a scheme, in which case we need to distinguish
    // between an HTTP URL and a query, or the scheme is HTTP or HTTPS, in which
    // case we should reject invalid formulations.

    // Determine the host family.  We get this information by (re-)canonicalizing
    // the already-canonicalized host rather than using the user's original input,
    // in case fixup affected the result here (e.g. an input that looks like an
    // IPv4 address but with a non-empty desired TLD would return IPV4 before
    // fixup and NEUTRAL afterwards, and we want to treat it as NEUTRAL).
    // TODO(sentialx): canonicalize host
    if (hostnameFamily === HostnameFamily.NEUTRAL && text.indexOf(' ') !== -1) {
      // Invalid hostname.  There are several possible cases:
      // * The user is typing a multi-word query.  If we see a space anywhere in
      //   the input host we assume this is a search and return QUERY.  (We check
      //   the input string instead of canonicalized_url->host() in case fixup
      //   escaped the space.)
      // * The user is typing some garbage string.  Return QUERY.
      // * Our checker is too strict and the user is typing a real-world URL
      //   that's "invalid" but resolves.  To catch these, we return UNKNOWN when
      //   the user explicitly typed a scheme or when the hostname has a known
      //   TLD, so we'll still search by default but we'll show the accidental
      //   search infobar if necessary.
      //
      // This means we would block the following kinds of navigation attempts:
      // * Navigations to a hostname with spaces
      // * Navigations to a hostname with invalid characters and an unknown TLD
      // These might be possible in intranets, but we're not going to support them
      // without concrete evidence that doing so is necessary.

      result.type =
        isNonEmpty(result.url.protocol) ||
        (hasKnownTld && result.url.hostname.indexOf(' ') === -1)
          ? OmniboxInputType.UNKNOWN
          : OmniboxInputType.QUERY;

      return result;
    }

    // For hostnames that look like IP addresses, distinguish between IPv6
    // addresses, which are basically guaranteed to be navigations, and IPv4
    // addresses, which are much fuzzier.
    if (hostnameFamily === HostnameFamily.IPV6) {
      result.type = OmniboxInputType.URL;
      return result;
    }

    if (hostnameFamily === HostnameFamily.IPV4) {
      // The host may be a real IP address, or something that looks a bit like it
      // (e.g. "1.2" or "3232235521").  We check whether it was convertible to an
      // IP with a non-zero first octet; IPs with first octet zero are "source
      // IPs" and are almost never navigable as destination addresses.
      //
      // The one exception to this is 0.0.0.0; on many systems, attempting to
      // navigate to this IP actually navigates to localhost.  To support this
      // case, when the converted IP is 0.0.0.0, we go ahead and run the "did the
      // user actually type four components" test in the conditional below, so
      // that we'll allow explicit attempts to navigate to "0.0.0.0".  If the
      // input was anything else (e.g. "0"), we'll fall through to returning QUERY
      // afterwards.
      const address = result.url.hostname.split('.');
      if (
        address[0] !== '0' ||
        (address[1] === '0' && address[2] === '0' && address[3] === '0')
      ) {
        // This is theoretically a navigable IP.  We have four cases.  The first
        // three are:
        // * If the user typed four distinct components, this is an IP for sure.
        // * If the user typed two or three components, this is almost certainly a
        //   query, especially for two components (as in "13.5/7.25"), but we'll
        //   allow navigation for an explicit scheme or trailing slash below.
        // * If the user typed one component, this is likely a query, but could be
        //   a non-dotted-quad version of an IP address.
        // Unfortunately, since we called CanonicalizeHost() on the
        // already-canonicalized host, all of these cases will have been changed
        // to have four components (e.g. 13.2 -> 13.0.0.2), so we have to call
        // CanonicalizeHost() again, this time on the original input, so that we
        // can get the correct number of IP components.
        //
        // The fourth case is that the user typed something ambiguous like ".1.2"
        // that fixup converted to an IP address ("1.0.0.2").  In this case the
        // call to CanonicalizeHost() will return NEUTRAL here.  Since it's not
        // clear what the user intended, we fall back to our other heuristics.
        if (address.length === 4) {
          result.type = OmniboxInputType.URL;
          return result;
        }
      }

      // By this point, if we have an "IP" with first octet zero, we know it
      // wasn't "0.0.0.0", so mark it as non-navigable.
      if (address[0] === '0') {
        result.type = OmniboxInputType.QUERY;
        return result;
      }
    }

    // Now that we've ruled out all schemes other than http or https and done a
    // little more sanity checking, the presence of a scheme means this is likely
    // a URL.
    if (isNonEmpty(result.url.protocol)) {
      result.type = OmniboxInputType.URL;
      return result;
    }

    // Check to see if the username is set and, if so, whether it contains a
    // space.  Usernames usually do not contain a space.  If a username contains
    // a space, that's likely an indication of incorrectly parsing of the input.
    const usernameHasSpace =
      isNonEmpty(result.url.username) &&
      result.url.username.indexOf(' ') !== -1;

    // Generally, trailing slashes force the input to be treated as a URL.
    // However, if the username has a space, this may be input like
    // "dep missing: @test/", which should not be parsed as a URL (with the
    // username "dep missing: ").
    if (isNonEmpty(result.url.pathname) && !usernameHasSpace) {
      const c = result.url.pathname[result.url.pathname.length - 1];
      if (c === '\\' || c === '/') {
        result.type = OmniboxInputType.URL;
        return result;
      }
    }

    // Handle the cases we detected in the IPv4 code above as "almost certainly a
    // query" now that we know the user hasn't tried to force navigation via a
    // scheme/trailing slash.
    if (
      hostnameFamily === HostnameFamily.IPV4 &&
      result.url.hostname.split('.').length > 1
    ) {
      result.type = OmniboxInputType.QUERY;
      return result;
    }

    // The URL did not have an explicit scheme and has an unusual-looking
    // username (with a space).  It's not likely to be a URL.
    if (usernameHasSpace) {
      result.type = OmniboxInputType.UNKNOWN;
      return result;
    }

    // If there is more than one recognized non-host component, this is likely to
    // be a URL, even if the TLD is unknown (in which case this is likely an
    // intranet URL).
    if (numNonHostComponents(result.url as any) > 1) {
      result.type = OmniboxInputType.URL;
      return result;
    }

    // If we reach here with a username, our input looks something like
    // "user@host".  Unless there is a desired TLD, we think this is more likely
    // an email address than an HTTP auth attempt, so we search by default.  (When
    // there _is_ a desired TLD, the user hit ctrl-enter, and we assume that
    // implies an attempted navigation.)
    // TODO(sentialx): canonicalized url.
    if (result.url.username && !isNonEmpty(desiredTld)) {
      result.type = OmniboxInputType.UNKNOWN;
      return result;
    }

    // If the host has a known TLD or a port, it's probably a URL. Just localhost
    // is considered a valid host name due to https://tools.ietf.org/html/rfc6761.
    if (hasKnownTld || result.url.hostname === 'localhost' || result.url.port) {
      result.type = OmniboxInputType.URL;
      return result;
    }

    // No scheme, username, port, and no known TLD on the host.
    // This could be:
    // * A single word "foo"; possibly an intranet site, but more likely a search.
    //   This is ideally an UNKNOWN, and we can let the Alternate Nav URL code
    //   catch our mistakes.
    // * A URL with a valid TLD we don't know about yet.  If e.g. a registrar adds
    //   "xxx" as a TLD, then until we add it to our data file, Chrome won't know
    //   "foo.xxx" is a real URL.  So ideally this is a URL, but we can't really
    //   distinguish this case from:
    // * A "URL-like" string that's not really a URL (like
    //   "browser.tabs.closeButtons" or "java.awt.event.*").  This is ideally a
    //   QUERY.  Since this is indistinguishable from the case above, and this
    //   case is much more likely, claim these are UNKNOWN, which should default
    //   to the right thing and let users correct us on a case-by-case basis.
    result.type = OmniboxInputType.UNKNOWN;
    return result;
  }
}
