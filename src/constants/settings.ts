import { ISettings } from '~/interfaces';
// import { remote, app } from 'electron';

export const DEFAULT_SEARCH_ENGINES = [
  {
    name: 'DuckDuckGo',
    url: 'https://duckduckgo.com/?q=%s',
    keywordsUrl: '',
    keyword: 'duckduckgo.com',
  },
  {
    name: 'Google',
    url: 'https://www.google.com/search?q=%s',
    keywordsUrl: 'http://google.com/complete/search?client=chrome&q=%s',
    keyword: 'google.com',
  },
  {
    name: 'Bing',
    url: 'https://www.bing.com/search?q=%s',
    keywordsUrl: '',
    keyword: 'bing.com',
  },
  {
    name: 'Yahoo!',
    url: 'https://search.yahoo.com/search?p=%s',
    keywordsUrl: '',
    keyword: 'yahoo.com',
  },
  {
    name: 'Ecosia',
    url: 'https://www.ecosia.org/search?q=%s',
    keywordsUrl: '',
    keyword: 'ecosia.org',
  },
  {
    name: 'Ekoru',
    url: 'https://www.ekoru.org/?ext=wexond&q=%s',
    keywordsUrl: 'http://ac.ekoru.org/?ext=wexond&q=%s',
    keyword: 'ekoru.org',
  },
];

export const DEFAULT_SETTINGS: ISettings = {
  theme: 'wexond-light',
  darkContents: false,
  shield: true,
  multrin: true,
  animations: true,
  bookmarksBar: false,
  suggestions: true,
  themeAuto: true,
  searchEngines: DEFAULT_SEARCH_ENGINES,
  searchEngine: 0,
  startupBehavior: {
    type: 'empty',
  },
  warnOnQuit: false,
  version: 2,
  downloadsDialog: false,
  // downloadsPath: remote
  //   ? remote.app.getPath('downloads')
  //   : app
  //   ? app.getPath('downloads')
  //   : '',
  doNotTrack: true,
  topBarVariant: 'default',
};
