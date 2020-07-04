import DbService from './db';
import {
  IVisitsDetails,
  IVisitItem,
  IHistorySearchDetails,
} from '~/interfaces';
import { IHistoryDbVisitsItem, IHistoryDbItem } from '../interfaces';
import {
  convertFromChromeTime,
  convertToChromeTime,
  dateToChromeTime,
} from '~/common/utils/date';
import {
  IHistoryItem,
  IHistoryAddDetails,
  IHistoryDeleteDetails,
  IHistoryDeleteRange,
  IHistoryVisitsRemoved,
  PageTransition,
} from '~/interfaces/history';
import { getYesterdayTime } from '../utils';
import { HistoryServiceBase } from '~/common/services/history';
import { WorkerMessengerFactory } from '~/common/worker-messenger-factory';
import { registerWorkerEventPropagator } from '../worker-event-handler';
import { IHistoryPrivateChunkDetails } from '~/interfaces/history-private';
import { URLRow } from '~/common/history/url-row';
import { IHistoryService } from '~/browser/services/history-service';

const ITEM_SELECT =
  'SELECT id, last_visit_time, title, typed_count, url, visit_count FROM urls';

const VISITS_ITEM_SELECT =
  'SELECT id, url, from_visit, visit_time, transition FROM visits';

const HISTORY_URL_ROW_FIELDS =
  'id, url, title, visit_count, typed_count, last_visit_time, hidden';

const urlToDatabaseUrl = (url: string) => {
  // TODO(sentialx): Strip username and password from URL before sending to DB.
  return url;
};

class HistoryService extends HistoryServiceBase implements IHistoryService {
  public start() {
    const handler = WorkerMessengerFactory.createHandler('history', this);

    handler('search', this.search);
    handler('getVisits', this.getVisits);
    handler('addUrl', this.addUrl);
    handler('setTitleForUrl', this.setTitleForUrl);
    handler('deleteUrl', this.deleteUrl);
    handler('deleteRange', this.deleteRange);
    handler('deleteAll', this.deleteAll);
    handler('getChunk', this.getChunk);
    handler('autocompleteForPrefix', this.autocompleteForPrefix);
    handler('findShortestURLFromBase', this.findShortestURLFromBase);
    handler('getRowForURL', this.getRowForURL);

    registerWorkerEventPropagator('history', ['visitRemoved'], this);
  }

  private get db() {
    return DbService.history;
  }

  private stripQualifier(type: PageTransition) {
    return type & ~PageTransition.PAGE_TRANSITION_QUALIFIER_MASK;
  }

  private getQualifier(type: PageTransition) {
    return type & PageTransition.PAGE_TRANSITION_QUALIFIER_MASK;
  }

  private getPageTransition(type: PageTransition) {
    return (
      type |
      PageTransition.PAGE_TRANSITION_CHAIN_START |
      PageTransition.PAGE_TRANSITION_CHAIN_END
    );
  }

  private getPageTransitionString(type: PageTransition) {
    const t = this.stripQualifier(type);

    switch (t) {
      case PageTransition.PAGE_TRANSITION_LINK:
        return 'link';
      case PageTransition.PAGE_TRANSITION_TYPED:
        return 'typed';
      case PageTransition.PAGE_TRANSITION_AUTO_BOOKMARK:
        return 'auto_bookmark';
      case PageTransition.PAGE_TRANSITION_AUTO_SUBFRAME:
        return 'auto_subframe';
      case PageTransition.PAGE_TRANSITION_MANUAL_SUBFRAME:
        return 'manual_subframe';
      case PageTransition.PAGE_TRANSITION_GENERATED:
        return 'generated';
      case PageTransition.PAGE_TRANSITION_AUTO_TOPLEVEL:
        return 'auto_toplevel';
      case PageTransition.PAGE_TRANSITION_FORM_SUBMIT:
        return 'form_submit';
      case PageTransition.PAGE_TRANSITION_RELOAD:
        return 'reload';
      case PageTransition.PAGE_TRANSITION_KEYWORD:
        return 'keyword';
      case PageTransition.PAGE_TRANSITION_KEYWORD_GENERATED:
        return 'keyword_generated';
    }

    return null;
  }

  private formatItem = ({
    id,
    last_visit_time,
    title,
    typed_count,
    url,
    visit_count,
  }: IHistoryDbItem): IHistoryItem => {
    return {
      id: id.toString(),
      lastVisitTime: convertFromChromeTime(last_visit_time),
      title,
      typedCount: typed_count,
      url,
      visitCount: visit_count,
    };
  };

  private formatVisitItem = ({
    id,
    url,
    from_visit,
    visit_time,
    transition,
  }: IHistoryDbVisitsItem): IVisitItem => {
    return {
      id: url.toString(),
      visitId: id.toString(),
      referringVisitId: from_visit.toString(),
      visitTime: convertFromChromeTime(visit_time),
      transition: this.getPageTransitionString(transition),
    };
  };

  private getUrlData(url: string, select = '*') {
    return this.db
      .getCachedStatement(`SELECT ${select} FROM urls WHERE url = ? LIMIT 1`)
      .get(url);
  }

  public async findShortestURLFromBase(
    base: string,
    url: string,
    minVisits: number,
    minTyped: number,
    allowBase: boolean,
  ): Promise<URLRow> {
    // Select URLs that start with |base| and are prefixes of |url|.  All parts
    // of this query except the substr() call can be done using the index.  We
    // could do this query with a couple of LIKE or GLOB statements as well, but
    // those wouldn't use the index, and would run into problems with "wildcard"
    // characters that appear in URLs (% for LIKE, or *, ? for GLOB).
    const sql = `SELECT ${HISTORY_URL_ROW_FIELDS} FROM urls WHERE url ${
      allowBase ? '>=' : '>'
    } @base AND url < @url AND url = substr(@url, 1, length(url)) AND hidden = 0 AND visit_count >= @minVisits AND typed_count >= @minTyped ORDER BY url LIMIT 1`;

    return this.db
      .getCachedStatement(sql)
      .get({ base, url, minVisits, minTyped });
  }

  public async getRowForURL(url: string): Promise<URLRow> {
    return this.db
      .getCachedStatement(
        `SELECT ${HISTORY_URL_ROW_FIELDS} FROM urls WHERE url = ?`,
      )
      .get(urlToDatabaseUrl(url));
  }

  public async autocompleteForPrefix(
    prefix: string,
    maxResults: number,
    typedOnly: boolean,
  ): Promise<URLRow[]> {
    // TODO(sentialx): use typedOnly
    const sql = `SELECT ${HISTORY_URL_ROW_FIELDS} FROM urls WHERE url >= @prefix AND url < @endQuery AND hidden = 0 ORDER BY typed_count DESC, visit_count DESC, last_visit_time DESC LIMIT @maxResults`;

    // We will find all strings between "prefix" and this string, which is prefix
    // followed by the maximum character size. Use 8-bit strings for everything
    // so we can be sure sqlite is comparing everything in 8-bit mode. Otherwise,
    // it will have to convert strings either to UTF-8 or UTF-16 for comparison.
    const endQuery = `${prefix}${String.fromCharCode(255)}`;

    const result = this.db
      .getCachedStatement(sql)
      .all({ prefix, endQuery, maxResults });

    return result;
  }

  public search({
    text,
    maxResults,
    startTime,
    endTime,
  }: IHistorySearchDetails): IHistoryItem[] {
    const limit = maxResults ?? 100;
    const start = convertToChromeTime(startTime ?? getYesterdayTime());
    const end = convertToChromeTime(endTime);

    let query = `${ITEM_SELECT} WHERE hidden = 0 `;

    let dateQuery = 'AND (last_visit_time >= @start ';

    if (endTime) {
      dateQuery += 'AND last_visit_time <= @end';
    }

    query += dateQuery + ') ';

    if (text) {
      query += `AND (url LIKE @text OR title LIKE @text)`;
    }

    return this.db
      .getCachedStatement(`${query} ORDER BY last_visit_time DESC LIMIT @limit`)
      .all({
        text: text != null ? `%${text}%` : null,
        limit,
        start,
        end,
      })
      .map(this.formatItem);
  }

  public getVisits({ url }: IVisitsDetails): IVisitItem[] {
    const id = this.getUrlData(url, 'id')?.id;

    if (!id) return [];

    return this.db
      .getCachedStatement(
        `${VISITS_ITEM_SELECT} WHERE url = ? ORDER BY visit_time ASC`,
      )
      .all(id)
      .map(this.formatVisitItem);
  }

  public setTitleForUrl(url: string, title: string) {
    this.db
      .getCachedStatement(`UPDATE urls SET title = @title WHERE url = @url`)
      .run({ url, title });
  }

  public addUrl({ url, title, transition }: IHistoryAddDetails) {
    if (!title) title = '';

    if (!transition) transition = PageTransition.PAGE_TRANSITION_LINK;
    transition = this.getPageTransition(transition);

    let item = this.getUrlData(url, 'id, visit_count');

    const time = dateToChromeTime(new Date());

    if (item) {
      this.db
        .getCachedStatement(
          `UPDATE urls SET title = @title, visit_count = @visitCount WHERE id = @id`,
        )
        .run({ id: item.id, visitCount: item.visit_count + 1, title });
    } else {
      this.db
        .getCachedStatement(
          `INSERT INTO urls (url, visit_count, last_visit_time, title) VALUES (@url, @visitCount, @lastVisitTime, @title)`,
        )
        .run({
          url,
          visitCount: 1,
          lastVisitTime: time,
          title,
        });

      item = this.getUrlData(url, 'id');
    }

    this.db
      .getCachedStatement(
        'INSERT INTO visits (url, visit_time, transition, from_visit, segment_id) VALUES (@url, @visitTime, @transition, 0, 0)',
      )
      .run({ url: item.id, visitTime: time, transition });
  }

  public deleteUrl({ url }: IHistoryDeleteDetails) {
    const { id } = this.getUrlData(url, 'id');

    this.db.getCachedStatement('DELETE FROM urls WHERE id = @id').run({ id });
    this.db
      .getCachedStatement('DELETE FROM visits WHERE url = @url')
      .run({ url: id });

    this.emit('visitRemoved', {
      allHistory: false,
      urls: [url],
    } as IHistoryVisitsRemoved);
  }

  public deleteRange({ startTime, endTime }: IHistoryDeleteRange) {
    const start = convertToChromeTime(startTime);
    const end = convertToChromeTime(endTime);

    const range = { start, end };

    const pages = this.db
      .getCachedStatement(
        `SELECT id, url FROM urls WHERE (last_visit_time >= @start AND last_visit_time <= @end)`,
      )
      .all(range);

    const visitQuery = this.db.getCachedStatement(
      `SELECT visit_time FROM visits WHERE url = @url`,
    );

    const removeUrl = this.db.getCachedStatement(
      'DELETE FROM urls where id = @id',
    );
    const removeVisit = this.db.getCachedStatement(
      'DELETE FROM visits where url = @url',
    );

    const urls: string[] = [];

    const count = this.db.transaction((pages: any[]) => {
      pages.forEach(({ id, url }) => {
        const visits: IVisitItem[] = visitQuery.all({ url: id });

        const inRange =
          visits.find((r) => r.visitTime < start || r.visitTime > end) == null;

        if (inRange) {
          urls.push(url);

          removeVisit.run({ url: id });
          removeUrl.run({ id });
        }
      });
    });

    count(pages);

    this.emit('visitRemoved', {
      allHistory: false,
      urls,
    } as IHistoryVisitsRemoved);
  }

  public deleteAll() {
    const urls: string[] = this.db
      .getCachedStatement('SELECT url FROM urls')
      .all()
      .map((r) => r.url);

    this.db.getCachedStatement('DELETE FROM urls').run();
    this.db.getCachedStatement('DELETE FROM visits').run();
    this.db.getCachedStatement('DELETE FROM visit_source').run();

    this.emit('visitRemoved', {
      allHistory: true,
      urls,
    } as IHistoryVisitsRemoved);
  }

  public getChunk(details: IHistoryPrivateChunkDetails): IHistoryItem[] {
    const limit = 32;
    const offset = (details.offset ?? 0) * limit;

    return this.db
      .getCachedStatement(
        `
      SELECT visits.id, urls.url, urls.title, visits.visit_time as last_visit_time FROM visits
      INNER JOIN urls
        ON urls.id = visits.url
      WHERE visits.transition = @transition
      ORDER BY visits.visit_time DESC LIMIT 100 OFFSET 0
    `,
      )
      .all({
        limit,
        offset,
        transition: this.getPageTransition(PageTransition.PAGE_TRANSITION_LINK),
      })
      .map(this.formatItem);
  }
}

export default new HistoryService();
