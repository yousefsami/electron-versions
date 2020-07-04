import { URLRow } from '~/common/history/url-row';

export interface IHistoryService {
  autocompleteForPrefix: (
    prefix: string,
    maxResults: number,
    typedOnly: boolean,
  ) => Promise<URLRow[]>;

  findShortestURLFromBase: (
    base: string,
    url: string,
    minVisits: number,
    minTyped: number,
    allowBase: boolean,
  ) => Promise<URLRow>;

  getRowForURL: (url: string) => Promise<URLRow>;
}
