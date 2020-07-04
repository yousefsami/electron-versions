// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { IAutocompleteProvider } from './autocomplete-provider';
import { URLPrefix } from './url-prefix';
import { Application } from '~/browser/application';
import { convertToChromeTime } from '~/common/utils/date';
import { format } from 'url';
import { IAutocompleteMatch, getMatchComponents } from './autocomplete-match';
import { IHistoryMatch } from './history-match';
import { IHistoryService } from '../history-service';
import { URLRow } from '~/common/history/url-row';
import { IAutocompleteInput, OmniboxInputType } from './autocomplete-input';

const kLowQualityMatchTypedLimit = 1;
const kLowQualityMatchVisitLimit = 4;
const kLowQualityMatchAgeLimitInDays = 3;

const isHostOnly = (url: string) => {
  const parsed = new URL(url);
  return (
    (parsed.pathname === '' || parsed.pathname === '/') &&
    parsed.search === '' &&
    parsed.href === ''
  );
};

enum PromoteType {
  WHAT_YOU_TYPED_MATCH,
  FRONT_HISTORY_MATCH,
  NEITHER,
}

const convertToHostOnly = (match: IHistoryMatch, input: string) => {
  // See if we should try to do host-only suggestions for this URL. Nonstandard
  // schemes means there's no authority section, so suggesting the host name
  // is useless. File URLs are standard, but host suggestion is not useful for
  // them either.
  const url = new URL(match.urlInfo.url);
  // TODO(sentialx): url.IsStandard() || url.SchemeIsFile()
  if (url.protocol === 'file:') return '';

  // Transform to a host-only match.  Bail if the host no longer matches the
  // user input (e.g. because the user typed more than just a host).
  const host = format({ ...url, pathname: null, query: null, search: null });
  if (host.length < match.inputLocation + input.length) return ''; // User typing is longer than this host suggestion.

  // if (input.substring(match.inputLocation, input.length) !== input) return ''; // User typing is no longer a prefix.

  return host;
};

const hasHTTPScheme = (input: string) => {
  // TODO(sentialx): handle view-source: scheme

  return input.startsWith('http');
};

export const isNonEmpty = (s: string | undefined) =>
  s != null && s.length > 0 && s !== 'empty:';

export const numNonHostComponents = (url: URL) => {
  let num = 0;
  if (isNonEmpty(url.protocol)) num++;
  if (isNonEmpty(url.username)) num++;
  if (isNonEmpty(url.password)) num++;
  if (isNonEmpty(url.port)) num++;
  if (isNonEmpty(url.pathname)) num++;
  if (isNonEmpty(url.search)) num++;
  return num;
};

export const isStringAValidURL = (s: string) => {
  try {
    new URL(s);
    return true;
  } catch (e) {
    return false;
  }
};

export class HistoryURLProvider implements IAutocompleteProvider {
  public static DEFAULT_MAX_MATCHES_PER_PROVIDER = 3;

  // A copy of the autocomplete input. We need the copy since this object will
  // live beyond the original query while it runs on the history thread.
  private input: IAutocompleteInput;

  // |input_before_fixup| is needed for invoking
  // |AutocompleteMatch::SetAllowedToBeDefault| which considers
  // trailing input whitespaces which the fixed up |input| will have trimmed.
  private inputBeforeFixup: IAutocompleteInput;

  // List of matches written by DoAutocomplete().  Upon its return the provider
  // converts this list to ACMatches and places them in |matches_|.
  private matches: IHistoryMatch[];

  // Set when "http://" should be trimmed from the beginning of the URLs.
  private trimHttp: boolean;

  // True if the suggestion for exactly what the user typed appears as a known
  // URL in the user's history.  In this case, this will also be the first match
  // in |matches|.
  //
  // NOTE: There are some complications related to keeping things consistent
  // between passes and how we deal with intranet URLs, which are too complex to
  // explain here; see the implementations of DoAutocomplete() and
  // FixupExactSuggestion() for specific comments.
  private exactSuggestionIsInHistory: boolean;

  // True if |what_you_typed_match| is eligible for display.  If this is true,
  // PromoteMatchesIfNecessary() may choose to place |what_you_typed_match| on
  // |matches_| even when |promote_type| is not WHAT_YOU_TYPED_MATCH.
  private haveWhatYouTypedMatch: boolean;

  // A match corresponding to what the user typed.
  private whatYouTypedMatch: IAutocompleteMatch;

  // Tells the provider whether to promote the what you typed match, the first
  // element of |matches|, or neither as the first AutocompleteMatch.  If
  // |exact_suggestion_is_in_history| is true (and thus "the what you typed
  // match" and "the first element of |matches|" represent the same thing), this
  // will be set to WHAT_YOU_TYPED_MATCH.
  //
  // NOTE: The second pass of DoAutocomplete() checks what the first pass set
  // this to.  See comments in DoAutocomplete().
  private promoteType: PromoteType;

  async start(input: IAutocompleteInput) {
    this.matches = [];
    this.input = input; // TODO(sentialx): fixup input
    this.inputBeforeFixup = input;
    this.trimHttp = !hasHTTPScheme(input.text);
    this.promoteType = PromoteType.NEITHER;
    this.whatYouTypedMatch = {
      destinationUrl: input.canonicalizedUrl,
      fillIntoEdit: input.text,
      contents: input.text,
      allowedToBeDefaultMatch: false,
      deletable: false,
      inlineAutocompletion: '',
      relevance: 0,
      typedCount: 0,
    };

    await this.doAutocomplete(Application.instance.storage.history);

    return this.queryComplete();
  }

  // Returns whether |match| is suitable for inline autocompletion.
  canPromoteMatchForInlineAutocomplete(match: IHistoryMatch) {
    // We can promote this match if it's been typed at least n times, where n == 1
    // for "simple" (host-only) URLs and n == 2 for others.  We set a higher bar
    // for these long URLs because it's less likely that users will want to visit
    // them again.  Even though we don't increment the typed_count for pasted-in
    // URLs, if the user manually edits the URL or types some long thing in by
    // hand, we wouldn't want to immediately start autocompleting it.
    // TODO(sentialx): set to 1, implement typed_count
    return match.urlInfo.typed_count > -1 || isHostOnly(match.urlInfo.url);
  }

  createOrPromoteMatch(
    info: URLRow,
    matchTemplate: IHistoryMatch,
    matches: IHistoryMatch[],
    createIfNecessary: boolean,
    promote: boolean,
  ): boolean {
    // |matches| may already have an entry for this.
    for (let i = 0; i < matches.length; ++i) {
      if (matches[i].urlInfo.url === info.url) {
        // Rotate it to the front if the caller wishes.
        if (promote) {
          const tmp = matches[0];
          matches[0] = matches[i];
          matches[i] = tmp;
        }
        return true;
      }
    }

    if (!createIfNecessary) return false;

    // No entry, so create one using |match_template| as a basis.
    const match = { ...matchTemplate, urlInfo: info };

    if (promote) matches.unshift(match);
    else matches.push(match);

    return true;
  }

  async promoteOrCreateShorterSuggestion(historyService: IHistoryService) {
    if (this.matches.length === 0) return false; // No matches, nothing to do.

    // Determine the base URL from which to search, and whether that URL could
    // itself be added as a match.  We can add the base iff it's not "effectively
    // the same" as any "what you typed" match.
    const match = this.matches[0];
    let searchBase = convertToHostOnly(match, this.input.text);
    let canAddSearchBaseToMatches = !this.haveWhatYouTypedMatch;

    if (searchBase.length === 0) {
      // Search from what the user typed when we couldn't reduce the best match
      // to a host.  Careful: use a substring of |match| here, rather than the
      // first match in |params|, because they might have different prefixes.  If
      // the user typed "google.com", params->what_you_typed_match will hold
      // "http://google.com/", but |match| might begin with
      // "http://www.google.com/".
      // TODO: this should be cleaned up, and is probably incorrect for IDN.
      const newMatch = match.urlInfo.url.substr(
        0,
        match.inputLocation + this.input.text.length,
      );
      searchBase = newMatch;
      if (searchBase.length === 0) return false; // Can't construct a URL from which to start a search.
    } else if (!canAddSearchBaseToMatches) {
      canAddSearchBaseToMatches =
        searchBase != this.whatYouTypedMatch.destinationUrl;
    }

    if (searchBase === match.urlInfo.url) return false; // Couldn't shorten |match|, so no URLs to search over.

    // Search the DB for short URLs between our base and |match|.
    let promote = true;
    // A short URL is only worth suggesting if it's been visited at least a third
    // as often as the longer URL.
    const minVisitCount = (match.urlInfo.visit_count - 1) / 3 + 1;
    // For stability between the in-memory and on-disk autocomplete passes, when
    // the long URL has been typed before, only suggest shorter URLs that have
    // also been typed.  Otherwise, the on-disk pass could suggest a shorter URL
    // (which hasn't been typed) that the in-memory pass doesn't know about,
    // thereby making the top match, and thus the behavior of inline
    // autocomplete, unstable.
    const minTypedCount = match.urlInfo.typed_count ? 1 : 0;

    let info = await historyService.findShortestURLFromBase(
      searchBase,
      match.urlInfo.url,
      minVisitCount,
      minTypedCount,
      canAddSearchBaseToMatches,
    );

    if (!info) {
      if (!canAddSearchBaseToMatches) return false; // Couldn't find anything and can't add the search base.

      // Try to get info on the search base itself.  Promote it to the top if the
      // original best match isn't good enough to autocomplete.
      info = await historyService.getRowForURL(searchBase);
      promote = match.urlInfo.typed_count <= 1;
    }

    if (!info) return false;

    const ensureCanInline =
      promote && this.canPromoteMatchForInlineAutocomplete(match);

    return (
      this.createOrPromoteMatch(info, match, this.matches, true, promote) &&
      ensureCanInline
    );
  }

  async doAutocomplete(historyService: IHistoryService) {
    // Get the matching URLs from the DB.
    const prefixes = URLPrefix.getURLPrefixes();
    for (const prefix of prefixes) {
      // We only need provider_max_matches_ results in the end, but before we
      // get there we need to promote lower-quality matches that are prefixes of
      // higher- quality matches, and remove lower-quality redirects.  So we ask
      // for more results than we need, of every prefix type, in hopes this will
      // give us far more than enough to work with.  CullRedirects() will then
      // reduce the list to the best provider_max_matches_ results.
      const prefixedInput = `${prefix.prefix}${this.input.text}`;
      const urlMatches = await historyService.autocompleteForPrefix(
        prefixedInput,
        HistoryURLProvider.DEFAULT_MAX_MATCHES_PER_PROVIDER * 2,
        false,
      );

      for (const urlMatch of urlMatches) {
        const url = urlMatch.url;
        const bestPrefix = URLPrefix.bestURLPrefix(url, '');
        if (!bestPrefix) return console.error();

        const match: IHistoryMatch = {
          urlInfo: urlMatch,
          inputLocation: prefix.prefix.length,
          innermostMatch:
            prefix.componentsCount >= (bestPrefix?.componentsCount ?? 0),
          ...getMatchComponents(url, [
            [prefix.prefix.length, prefixedInput.length],
          ]),
        };

        this.matches.push(match);
      }
    }

    this.cullPoorMatches(this.matches);
    this.sortAndDedupMatches(this.matches);

    // Try to create a shorter suggestion from the best match.
    // We consider the what you typed match eligible for display when it's
    // navigable and there's a reasonable chance the user intended to do
    // something other than search.  We use a variety of heuristics to determine
    // this, e.g. whether the user explicitly typed a scheme, or if omnibox
    // searching has been disabled by policy. In the cases where we've parsed as
    // UNKNOWN, we'll still show an accidental search infobar if need be.
    // TODO(sentialx): VisitClassifier
    this.haveWhatYouTypedMatch =
      this.input.type !== OmniboxInputType.QUERY &&
      (this.input.type !== OmniboxInputType.UNKNOWN ||
        !this.trimHttp ||
        numNonHostComponents(this.input.url) > 0);

    const haveShorterSuggestionSuitableForInlineAutocomplete = await this.promoteOrCreateShorterSuggestion(
      historyService,
    );
    // Check whether what the user typed appears in history.
    const canCheckHistoryForExactMatch =
      // Checking what_you_typed_match.destination_url.is_valid() tells us
      // whether SuggestExactInput() succeeded in constructing a valid match.
      isStringAValidURL(this.whatYouTypedMatch.destinationUrl) &&
      // Additionally, in the case where the user has typed "foo.com" and
      // visited (but not typed) "foo/", and the input is "foo", the first pass
      // will fall into the FRONT_HISTORY_MATCH case for "foo.com" but the
      // second pass can suggest the exact input as a better URL.  Since we need
      // both passes to agree, and since during the first pass there's no way to
      // know about "foo/", ensure that if the promote type was set to
      // FRONT_HISTORY_MATCH during the first pass, the second pass will not
      // consider the exact suggestion to be in history and therefore will not
      // suggest the exact input as a better match.  (Note that during the first
      // pass, this conditional will always succeed since |promote_type| is
      // initialized to NEITHER.)
      this.promoteType !== PromoteType.FRONT_HISTORY_MATCH;
    // TODO(sentialx):
    // params.exactSuggestionIsInHistory = canCheckHistoryForExactMatch &&
    //     FixupExactSuggestion(db, classifier, params);

    // If we succeeded in fixing up the exact match based on the user's history,
    // we should treat it as the best match regardless of input type.  If not,
    // then we check whether there's an inline autocompletion we can create from
    // this input, so we can promote that as the best match.
    if (this.exactSuggestionIsInHistory) {
      this.promoteType = PromoteType.WHAT_YOU_TYPED_MATCH;
    } else if (
      this.matches.length !== 0 &&
      (haveShorterSuggestionSuitableForInlineAutocomplete ||
        this.canPromoteMatchForInlineAutocomplete(this.matches[0]))
    ) {
      // Note that we promote this inline-autocompleted match even when
      // params->prevent_inline_autocomplete is true.  This is safe because in
      // this case the match will be marked as "not allowed to be default", and
      // a non-inlined match that is "allowed to be default" will be reordered
      // above it by the controller/AutocompleteResult.  We ensure there is such
      // a match in two ways:
      //   * If params->have_what_you_typed_match is true, we force the
      //     what-you-typed match to be added in this case.  See comments in
      //     PromoteMatchesIfNecessary().
      //   * Otherwise, we should have some sort of QUERY or UNKNOWN input that
      //     the SearchProvider will provide a defaultable what-you-typed match
      //     for.
      this.promoteType = PromoteType.FRONT_HISTORY_MATCH;
    } else {
      // Failed to promote any URLs.  Use the What You Typed match, if we have it.
      this.promoteType = this.haveWhatYouTypedMatch
        ? PromoteType.WHAT_YOU_TYPED_MATCH
        : PromoteType.NEITHER;
    }

    const maxResults =
      HistoryURLProvider.DEFAULT_MAX_MATCHES_PER_PROVIDER +
      (this.exactSuggestionIsInHistory ? 1 : 0);

    this.matches = this.matches.slice(0, maxResults + 1);
  }

  // TODO(sentialx): move to URLDatabase
  autocompleteAgeThreshold() {
    return convertToChromeTime(Date.now() - 3 * 1000 * 60 * 60 * 24);
  }

  rowQualifiesAsSignificant(row: URLRow, threshold: number) {
    if (row.hidden) return false;

    const realThreshold = threshold ?? this.autocompleteAgeThreshold();

    return (
      row.typed_count >= kLowQualityMatchTypedLimit ||
      row.visit_count >= kLowQualityMatchVisitLimit ||
      row.last_visit_time >= realThreshold
    );
  }

  cullPoorMatches(matches: IHistoryMatch[]) {
    const threshold = this.autocompleteAgeThreshold();
    for (let i = 0; i < matches.length; i++) {
      // TODO(sentialx): default_search_provider
      if (this.rowQualifiesAsSignificant(matches[i].urlInfo, threshold)) {
      } else {
        matches.splice(i, 1);
        --i;
      }
    }
  }

  sortAndDedupMatches(matches: IHistoryMatch[]) {
    const c = (b: boolean) => (b ? 1 : -1);
    // Sort by quality, best first.
    matches.sort((a, b) => {
      // A URL that has been typed at all is better than one that has never been
      // typed.  (Note "!"s on each side)
      if (!a.urlInfo.typed_count != !b.urlInfo.typed_count)
        return c(a.urlInfo.typed_count > b.urlInfo.typed_count);

      // Innermost matches (matches after any scheme or "www.") are better than
      // non-innermost matches.
      if (a.innermostMatch != b.innermostMatch) return c(a.innermostMatch);

      // URLs that have been typed more often are better.
      if (a.urlInfo.typed_count != b.urlInfo.typed_count)
        return c(a.urlInfo.typed_count > b.urlInfo.typed_count);

      // For URLs that have each been typed once, a host (alone) is better than a
      // page inside.
      if (
        a.urlInfo.typed_count == 1 &&
        isHostOnly(a.urlInfo.url) != isHostOnly(b.urlInfo.url)
      )
        return c(isHostOnly(a.urlInfo.url));

      // URLs that have been visited more often are better.
      if (a.urlInfo.visit_count != b.urlInfo.visit_count)
        return c(a.urlInfo.visit_count > b.urlInfo.visit_count);

      // URLs that have been visited more recently are better.
      if (a.urlInfo.last_visit_time != b.urlInfo.last_visit_time)
        return c(a.urlInfo.last_visit_time > b.urlInfo.last_visit_time);

      // Use alphabetical order on the url spec as a tie-breaker.
      return c(a.urlInfo.url > b.urlInfo.url);
    });

    // Remove duplicate matches (caused by the search string appearing in one of
    // the prefixes as well as after it).  Consider the following scenario:
    //
    // User has visited "http://http.com" once and "http://htaccess.com" twice.
    // User types "http".  The autocomplete search with prefix "http://" returns
    // the first host, while the search with prefix "" returns both hosts.  Now
    // we sort them into rank order:
    //   http://http.com     (innermost_match)
    //   http://htaccess.com (!innermost_match, url_info.visit_count == 2)
    //   http://http.com     (!innermost_match, url_info.visit_count == 1)
    //
    // The above scenario tells us we can't use std::unique(), since our
    // duplicates are not always sequential.  It also tells us we should remove
    // the lower-quality duplicate(s), since otherwise the returned results won't
    // be ordered correctly.  This is easy to do: we just always remove the later
    // element of a duplicate pair.
    // Be careful!  Because the vector contents may change as we remove elements,
    // we use an index instead of an iterator in the outer loop, and don't
    // precalculate the ending position.
    for (let i = 0; i < matches.length; ++i) {
      for (let j = i + 1; j < matches.length; ++j) {
        if (matches[i].urlInfo.url === matches[j].urlInfo.url) {
          matches.splice(j, 1);
          j--;
        } else ++j;
      }
    }
  }

  // TODO(sentialx)
  historyMatchToACMatch(historyMatch: IHistoryMatch, relevance: number) {
    const { urlInfo } = historyMatch;

    const match: IAutocompleteMatch = {
      relevance,
      typedCount: urlInfo.typed_count,
      destinationUrl: urlInfo.url,
      fillIntoEdit: urlInfo.url,
      contents: urlInfo.url,
      description: urlInfo.title,
      deletable: !!urlInfo.visit_count,
      allowedToBeDefaultMatch: false,
      inlineAutocompletion: '',
    };

    const inlineAutocompleteOffset = this.input.text.length;

    let { url } = urlInfo;

    const parsed = new URL(url);

    if (!historyMatch.matchInSubdomain) {
      if (parsed.hostname.startsWith('www.')) {
        parsed.hostname = parsed.hostname.substr(4);
        //inlineAutocompleteOffset -= 4;
      }
    }

    url = parsed.href;

    if (this.trimHttp && !historyMatch.matchInScheme) {
      // inlineAutocompleteOffset -= url.match(/^(https?:|)\/\//).length;
      url = url.replace(/^(https?:|)\/\//, '');
    }

    if (url[url.length - 1] === '/') url = url.substring(0, url.length - 1);

    match.fillIntoEdit = url;
    match.contents = url;

    if (
      inlineAutocompleteOffset !== -1 &&
      !this.input.preventInlineAutocomplete
    ) {
      match.inlineAutocompletion = match.fillIntoEdit.substr(
        inlineAutocompleteOffset,
      );
      match.allowedToBeDefaultMatch = true;
    }

    return match;
  }

  promoteMatchesIfNecessary(matches: IAutocompleteMatch[]) {
    // TODO(sentialx): calculate relevance
    if (this.promoteType === PromoteType.NEITHER) return;
    if (this.promoteType === PromoteType.FRONT_HISTORY_MATCH) {
      matches.push(this.historyMatchToACMatch(this.matches[0], 1000));
    }
    // There are two cases where we need to add the what-you-typed-match:
    //   * If params.promote_type is WHAT_YOU_TYPED_MATCH, we're being explicitly
    //     directed to.
    //   * If params.have_what_you_typed_match is true, then params.promote_type
    //     can't be NEITHER (see code near the end of DoAutocomplete()), so if
    //     it's not WHAT_YOU_TYPED_MATCH, it must be FRONT_HISTORY_MATCH, and
    //     we'll have promoted the history match above.  If
    //     params.prevent_inline_autocomplete is also true, then this match
    //     will be marked "not allowed to be default", and we need to add the
    //     what-you-typed match to ensure there's a legal default match for the
    //     controller/AutocompleteResult to promote.  (If
    //     params.have_what_you_typed_match is false, the SearchProvider should
    //     take care of adding this defaultable match.)
    if (
      this.promoteType === PromoteType.WHAT_YOU_TYPED_MATCH ||
      (!matches[matches.length - 1].allowedToBeDefaultMatch &&
        this.haveWhatYouTypedMatch)
    ) {
      if (this.input.preventInlineAutocomplete) {
        matches.unshift(this.whatYouTypedMatch);
      } else {
        matches.push(this.whatYouTypedMatch);
      }
    }
  }

  queryComplete() {
    const newMatches: IAutocompleteMatch[] = [];

    this.promoteMatchesIfNecessary(newMatches);
    let relevance = 999;

    const firstMatch =
      this.exactSuggestionIsInHistory ||
      this.promoteType === PromoteType.FRONT_HISTORY_MATCH
        ? 1
        : 0;
    for (let i = firstMatch; i < this.matches.length; ++i) {
      // All matches score one less than the previous match.
      --relevance;

      if (newMatches.length !== 0) {
        // TODO(sentialx):
        // relevance = CalculateRelevanceScoreUsingScoringParams(
        //  params->matches[i], relevance, scoring_params_);
      }
      newMatches.push(this.historyMatchToACMatch(this.matches[i], relevance));
    }

    return newMatches;
  }
}
