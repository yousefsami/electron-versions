// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { OmniboxInputType } from './autocomplete-input';

// An interface that gives embedders the ability to automatically classify the
// omnibox input type based on an explicitly-specified schemes.  If users type
// an input with an explicit scheme other than http, https, or file, this class
// will be used to try and determine whether the input should be treated as a
// URL (for known schemes we want to handle) or a query (for known schemes that
// should be blocked), or if the scheme alone isn't sufficient to make a
// determination.
export interface IAutocompleteSchemeClassifier {
  // Checks |scheme| and returns the type of the input if the scheme is known
  // and not blocked. Returns metrics::OmniboxInputType::EMPTY if it's unknown
  // or the classifier implementation cannot handle.
  getInputTypeForScheme: (scheme: string) => OmniboxInputType;
}

// TODO(sentialx): https://source.chromium.org/chromium/chromium/src/+/master:chrome/browser/autocomplete/chrome_autocomplete_scheme_classifier.cc;l=50?originalUrl=https:%2F%2Fcs.chromium.org%2F
export class AutocompleteSchemeClassifier
  implements IAutocompleteSchemeClassifier {
  getInputTypeForScheme(scheme: string): OmniboxInputType {
    return OmniboxInputType.URL;
  }
}
