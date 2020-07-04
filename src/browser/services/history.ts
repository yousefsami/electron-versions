import { Worker } from 'worker_threads';

import {
  IVisitsDetails,
  IVisitItem,
  IHistorySearchDetails,
  IHistoryItem,
  IHistoryAddDetails,
  IHistoryDeleteRange,
} from '~/interfaces';
import { extensions } from '../extensions';
import { HistoryServiceBase } from '~/common/services/history';
import { WorkerMessengerFactory } from '~/common/worker-messenger-factory';
import { IHistoryPrivateChunkDetails } from '~/interfaces/history-private';
import { URLRow } from '~/common/history/url-row';
import { IHistoryService } from './history-service';

export class HistoryService extends HistoryServiceBase
  implements IHistoryService {
  private invoker = WorkerMessengerFactory.createInvoker('history');

  constructor(worker: Worker) {
    super();
    this.invoker.initialize(worker);

    extensions.history.start(this);
    extensions.historyPrivate.start(this);
  }

  public autocompleteForPrefix = (
    prefix: string,
    maxResults: number,
    typedOnly: boolean,
  ): Promise<URLRow[]> =>
    this.invoker.invoke('autocompleteForPrefix', prefix, maxResults, typedOnly);

  public findShortestURLFromBase = (
    base: string,
    url: string,
    minVisits: number,
    minTyped: number,
    allowBase: boolean,
  ): Promise<URLRow> =>
    this.invoker.invoke(
      'findShortestURLFromBase',
      base,
      url,
      minVisits,
      minTyped,
      allowBase,
    );

  public getRowForURL = (url: string): Promise<URLRow> =>
    this.invoker.invoke('getRowForURL', url);

  public search = (details: IHistorySearchDetails) =>
    this.invoker.invoke<IHistoryItem[]>('search', details);

  public getVisits = (details: IVisitsDetails) =>
    this.invoker.invoke<IVisitItem[]>('getVisits', details);

  public addUrl = (details: IHistoryAddDetails) =>
    this.invoker.invoke('addUrl', details);

  public setTitleForUrl = (url: string, title: string) =>
    this.invoker.invoke('setTitleForUrl', url, title);

  public deleteUrl = (details: IHistoryAddDetails) =>
    this.invoker.invoke('deleteUrl', details);

  public deleteRange = (range: IHistoryDeleteRange) =>
    this.invoker.invoke('deleteRange', range);

  public deleteAll = () => this.invoker.invoke('deleteAll');

  public getChunk = (details: IHistoryPrivateChunkDetails) =>
    this.invoker.invoke<IHistoryItem[]>('getChunk', details);
}
