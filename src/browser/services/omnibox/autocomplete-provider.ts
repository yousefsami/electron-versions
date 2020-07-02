import { IAutocompleteInput } from './autocomplete-input';
import { IAutocompleteMatch } from './autocomplete-match';

export interface IAutocompleteProvider {
  start: (input: IAutocompleteInput) => Promise<IAutocompleteMatch[]>;
}
