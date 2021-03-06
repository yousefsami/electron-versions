import { observable, action, computed } from 'mobx';
import * as React from 'react';

import { ITab, ITabGroup } from '../models';

import {
  TAB_ANIMATION_DURATION,
  TABS_PADDING,
  TAB_MAX_WIDTH,
} from '../constants';

import store from '.';
import { ipcRenderer } from 'electron';
import { defaultTabOptions } from '~/constants/tabs';
import { TOOLBAR_HEIGHT } from '~/constants/design';
import { TabEvent } from '~/interfaces/tabs';
import { getColorBrightness } from '~/utils/colors';

const isColorAcceptable = (color: string) => {
  if (store.theme['tab.allowLightBackground']) {
    return getColorBrightness(color) > 120;
  }

  return getColorBrightness(color) < 170;
};

export class TabsStore {
  @observable
  public isDragging = false;

  @observable
  public hoveredTabId: number;

  @observable
  public list: ITab[] = [];

  @observable
  public selectedTabId: number;

  public removedTabs = 0;

  public lastScrollLeft = 0;
  public lastMouseX = 0;
  public mouseStartX = 0;
  public tabStartX = 0;

  private scrollTimeout: any;

  public scrollingToEnd = false;
  public scrollable = false;

  public closedUrl = '';

  public canShowPreview = true;

  public containerRef = React.createRef<HTMLDivElement>();

  public leftMargins = 0;

  @computed
  public get selectedTab() {
    return this.getTabById(this.selectedTabId);
  }

  @computed
  public get hoveredTab() {
    return this.getTabById(this.hoveredTabId);
  }

  public constructor() {
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('resize', this.onResize);

    ipcRenderer.on('tabs-resize', () => {
      this.updateTabsBounds(true);
    });

    ipcRenderer.on(
      'create-tab',
      (
        e,
        options: chrome.tabs.CreateProperties,
        isNext: boolean,
        id: number,
      ) => {
        if (isNext) {
          const index = this.list.indexOf(this.selectedTab) + 1;
          options.index = index;
        }

        this.createTab(options, id);
      },
    );

    ipcRenderer.on('select-next-tab', () => {
      const i = this.list.indexOf(this.selectedTab);
      const nextTab = this.list[i + 1];

      if (!nextTab) {
        if (this.list[0]) {
          this.list[0].select();
        }
      } else {
        nextTab.select();
      }
    });

    ipcRenderer.on('select-tab-index', (e, i) => {
      this.list[i]?.select();
    });

    ipcRenderer.on('select-last-tab', () => {
      this.list[this.list.length - 1]?.select();
    });

    ipcRenderer.on('select-previous-tab', () => {
      const i = this.list.indexOf(this.selectedTab);
      const prevTab = this.list[i - 1];

      if (!prevTab) {
        if (this.list[this.list.length - 1]) {
          this.list[this.list.length - 1].select();
        }
      } else {
        prevTab.select();
      }
    });

    ipcRenderer.on('remove-tab', (e, id: number) => {
      this.getTabById(id)?.close();
    });

    ipcRenderer.on('tab-event', (e, event: TabEvent, tabId, args) => {
      const tab = this.getTabById(tabId);

      if (tab) {
        if (event === 'blocked-ad') {
          tab.blockedAds++;
        } else if (
          event === 'url-updated' ||
          event === 'title-updated' ||
          event === 'favicon-updated'
        ) {
          if (event === 'url-updated') {
            const [url] = args;
            tab.url = url;
          } else if (event === 'title-updated') {
            const [title] = args;
            tab.title = title;
          } else if (event === 'favicon-updated') {
            const [favicon] = args;
            tab.favicon = favicon;
          }

          tab.updateData();
        } else if (event === 'color-updated') {
          const [color] = args;
          if (isColorAcceptable(color)) {
            tab.background = color;
            tab.customColor = true;
          } else {
            tab.background = store.theme.accentColor;
            tab.customColor = false;
          }
        } else if (event === 'theme-color-updated') {
          const [color] = args;
          if (color && isColorAcceptable(color)) {
            tab.background = color;
            tab.hasThemeColor = true;
            tab.customColor = true;
          } else {
            tab.background = store.theme.accentColor;
            tab.hasThemeColor = false;
            tab.customColor = false;
          }
        } else if (event === 'load-commit') {
          const [, , isMainFrame] = args;
          if (isMainFrame) {
            tab.blockedAds = 0;
          }
        } else if (event === 'did-navigate') {
          tab.background = store.theme.accentColor;
          tab.customColor = false;
          tab.favicon = '';
        } else if (
          event === 'loading' ||
          event === 'pinned' ||
          event === 'credentials'
        ) {
          const [state] = args;
          if (event === 'loading') {
            tab.loading = state;
          } else if (event === 'pinned') {
            tab.isPinned = state;
          } else if (event === 'credentials') {
            tab.hasCredentials = state;
          }
        }
      }
    });

    ipcRenderer.on('revert-closed-tab', () => {
      this.revertClosed();
    });

    ipcRenderer.on('get-search-tabs', () => {
      ipcRenderer.send(
        'get-search-tabs',
        this.list.map((tab) => ({
          favicon: tab.favicon,
          url: tab.url,
          title: tab.title,
          id: tab.id,
        })),
      );
    });
  }

  @action
  public onResize = (e: Event) => {
    if (e.isTrusted) {
      this.removedTabs = 0;
      this.updateTabsBounds(false);
    }
  };

  public get containerWidth() {
    if (this.containerRef.current) {
      return this.containerRef.current.offsetWidth;
    }
    return 0;
  }

  public getTabById(id: number) {
    return this.list.find((x) => x.id === id);
  }

  @action public createTab(
    options: chrome.tabs.CreateProperties,
    id: number,
    tabGroupId: number = undefined,
  ) {
    this.removedTabs = 0;

    const tab = new ITab(options, id);

    tab.tabGroupId = tabGroupId;

    if (options.index !== undefined) {
      this.list.splice(options.index, 0, tab);
    } else {
      this.list.push(tab);
    }

    requestAnimationFrame(() => {
      tab.setLeft(tab.getLeft(), false);
      this.updateTabsBounds(true);
      this.scrollToEnd(TAB_ANIMATION_DURATION);
    });
    return tab;
  }

  @action public createTabs(
    options: chrome.tabs.CreateProperties[],
    ids: number[],
  ) {
    this.removedTabs = 0;

    const tabs = options.map((option, i) => {
      const tab = new ITab(option, ids[i]);
      this.list.push(tab);
      return tab;
    });

    requestAnimationFrame(() => {
      this.updateTabsBounds(false);
      if (this.scrollable) {
        this.containerRef.current.scrollLeft = this.containerRef.current.scrollWidth;
      }
    });

    return tabs;
  }

  public scrollToEnd = (milliseconds: number) => {
    if (!this.scrollable) return;

    const frame = () => {
      if (!this.scrollingToEnd) return;
      this.containerRef.current.scrollLeft = this.containerRef.current.scrollWidth;
      requestAnimationFrame(frame);
    };

    if (!this.scrollingToEnd) {
      this.scrollingToEnd = true;
      frame();
    }

    clearTimeout(this.scrollTimeout);

    this.scrollTimeout = setTimeout(() => {
      this.scrollingToEnd = false;
    }, milliseconds);
  };

  @action
  public async addTab(
    options = defaultTabOptions,
    tabGroupId: number = undefined,
  ) {
    ipcRenderer.send(`hide-window-${store.windowId}`);

    const opts = { ...defaultTabOptions, ...options };

    const id: number = await ipcRenderer.invoke(
      `view-create-${store.windowId}`,
      opts,
    );
    return this.createTab(opts, id, tabGroupId);
  }

  @action
  public async addTabs(options: chrome.tabs.CreateProperties[]) {
    ipcRenderer.send(`hide-window-${store.windowId}`);

    for (let i = 0; i < options.length; i++) {
      if (i === options.length - 1) {
        options[i].active = true;
      } else {
        options[i].active = false;
      }
    }

    const ids = await ipcRenderer.invoke(
      `views-create-${store.windowId}`,
      options,
    );
    return this.createTabs(options, ids);
  }

  public removeTab(id: number) {
    (this.list as any).remove(this.getTabById(id));
  }

  @action
  public pinTab(tab: ITab) {
    tab.isPinned = true;
    store.startupTabs.updateStartupTabItem(tab);
    requestAnimationFrame(() => {
      tab.setLeft(0, false);
      this.getTabsToReplace(tab, 'left');
      this.updateTabsBounds(true);
    });
  }

  @action
  public unpinTab(tab: ITab) {
    tab.isPinned = false;
    store.startupTabs.updateStartupTabItem(tab);
    requestAnimationFrame(() => {
      tab.setLeft(
        Math.max(
          ...this.list.map(function (item) {
            return item.left;
          }),
        ) + TAB_MAX_WIDTH,
        false,
      );
      this.getTabsToReplace(tab, 'right');
      this.updateTabsBounds(true);
    });
  }

  @action
  public muteTab(tab: ITab) {
    ipcRenderer.send(`mute-view-${store.windowId}`, tab.id);
    tab.isMuted = true;
  }

  @action
  public unmuteTab(tab: ITab) {
    ipcRenderer.send(`unmute-view-${store.windowId}`, tab.id);
    tab.isMuted = false;
  }

  @action
  public updateTabsBounds(animation: boolean) {
    this.calculateTabMargins();
    this.setTabsWidths(animation);
    this.setTabGroupsLefts(animation);
    this.setTabsLefts(animation);
  }

  @action
  public calculateTabMargins() {
    const tabs = this.list.filter((x) => !x.isClosing);

    let currentGroup: number;

    this.leftMargins = 0;

    for (const tab of tabs) {
      tab.marginLeft = 0;

      if (tab.tabGroupId !== currentGroup) {
        if (tab.tabGroup) {
          tab.marginLeft = tab.tabGroup.placeholderRef.current.offsetWidth + 16;
        } else {
          tab.marginLeft = 6;
        }

        currentGroup = tab.tabGroupId;
      }

      this.leftMargins += tab.marginLeft;
    }
  }

  @action
  public setTabGroupsLefts(animation: boolean) {
    const tabs = this.list.filter((x) => !x.isClosing);

    let left = 0;
    let currentGroup: number;

    for (const tab of tabs) {
      const group = tab.tabGroup;
      if (tab.tabGroupId !== currentGroup) {
        if (group) {
          group.setLeft(left + 8, animation && !tab.tabGroup.isNew);
          group.isNew = false;
        }

        left += tab.marginLeft;

        currentGroup = tab.tabGroupId;
      }

      left += tab.width + TABS_PADDING;
    }
  }

  @action
  public setTabsWidths(animation: boolean) {
    const tabs = this.list.filter((x) => !x.isClosing);

    const containerWidth = this.containerWidth;
    let currentGroup: ITabGroup;

    for (const tab of tabs) {
      const width = tab.getWidth(containerWidth, tabs);
      tab.setWidth(width, animation);
      const group = tab.tabGroup;

      if (group) {
        if (group !== currentGroup) {
          if (currentGroup) {
            currentGroup.setWidth(currentGroup.width, animation);
          }
          group.width = tab.marginLeft - 8 - TABS_PADDING;
          currentGroup = group;
        }
        group.width = group.width + width + TABS_PADDING;
      }

      this.scrollable = width === 72;
    }

    if (currentGroup) {
      currentGroup.setWidth(currentGroup.width, animation);
    }
  }

  @action
  public setTabsLefts(animation: boolean) {
    const tabs = this.list.filter((x) => !x.isClosing);

    const { containerWidth } = store.tabs;

    let left = 0;

    for (const tab of tabs) {
      left += tab.marginLeft;

      if (!tab.isDragging) {
        tab.setLeft(left, animation);
      }

      left += tab.width + TABS_PADDING;
    }

    store.addTab.setLeft(
      Math.min(left, containerWidth + TABS_PADDING),
      animation,
    );
  }

  @action
  public replaceTab(firstTab: ITab, secondTab: ITab) {
    const index = this.list.indexOf(secondTab);

    this.list[this.list.indexOf(firstTab)] = secondTab;
    this.list[index] = firstTab;

    firstTab.updateData();
    secondTab.updateData();

    this.updateTabsBounds(true);
  }

  public getTabsToReplace(callingTab: ITab, direction: string) {
    const tabs = this.list;
    const index = tabs.indexOf(callingTab);

    const { tabGroup } = callingTab;
    if (tabGroup) {
      if (
        callingTab.left < tabGroup.left ||
        callingTab.left + callingTab.width >=
          tabGroup.left + tabGroup.width + 20
      ) {
        callingTab.removeFromGroup();
        return;
      }
    }

    if (direction === 'left') {
      for (let i = index - 1; i >= 0; i--) {
        const tab = tabs[i];

        if (callingTab.isPinned && callingTab.isPinned && tab.isPinned) break;

        const { tabGroup } = tab;

        if (tabGroup) {
          const tabGroupTabs = tab.tabGroup.tabs;
          const lastTab = tabGroupTabs[tabGroupTabs.length - 1];

          if (
            callingTab.tabGroupId !== tab.tabGroupId &&
            callingTab.left <= lastTab.left + lastTab.width * 0.75
          ) {
            callingTab.tabGroupId = tab.tabGroupId;
            this.updateTabsBounds(true);
          }
        }

        if (callingTab.left <= tab.width / 2 + tab.left) {
          this.replaceTab(tabs[i + 1], tab);
        } else {
          break;
        }
      }
    } else if (direction === 'right') {
      for (let i = index + 1; i < tabs.length; i++) {
        const tab = tabs[i];

        if (callingTab.isPinned && callingTab.isPinned && tab.isPinned) break;

        const { tabGroup } = tab;

        if (tabGroup) {
          const tabGroupTabs = tab.tabGroup.tabs;
          const firstTab = tabGroupTabs[0];

          if (
            callingTab.tabGroupId !== tab.tabGroupId &&
            callingTab.left + callingTab.width >= firstTab.left
          ) {
            callingTab.tabGroupId = tab.tabGroupId;
            this.updateTabsBounds(true);
          }
        }

        if (callingTab.left + callingTab.width >= tab.width / 2 + tab.left) {
          this.replaceTab(tabs[i - 1], tab);
        } else {
          break;
        }
      }
    }
  }

  @action
  public onMouseUp = () => {
    const selectedTab = this.selectedTab;

    this.isDragging = false;

    if (selectedTab) {
      selectedTab.isDragging = false;
    }

    this.updateTabsBounds(true);
  };

  @action
  public onMouseMove = (e: any) => {
    const { selectedTab } = this;

    if (this.isDragging) {
      const container = this.containerRef;
      const { tabStartX, mouseStartX, lastMouseX, lastScrollLeft } = store.tabs;

      const boundingRect = container.current.getBoundingClientRect();

      if (Math.abs(e.pageX - mouseStartX) < 5) {
        return;
      }

      store.canToggleMenu = false;
      selectedTab.isDragging = true;

      const newLeft =
        tabStartX +
        e.pageX -
        mouseStartX -
        (lastScrollLeft - container.current.scrollLeft);

      let left = Math.max(0, newLeft);

      if (
        newLeft + selectedTab.width >
        container.current.scrollLeft +
          container.current.offsetWidth -
          TABS_PADDING +
          20
      ) {
        left =
          container.current.scrollLeft +
          container.current.offsetWidth -
          selectedTab.width -
          TABS_PADDING +
          20;
      }

      selectedTab.setLeft(left, false);

      if (
        e.pageY > TOOLBAR_HEIGHT + 16 ||
        e.pageY < -16 ||
        e.pageX < boundingRect.left ||
        e.pageX - boundingRect.left > store.addTab.left
      ) {
        // TODO: Create a new window
      }

      this.getTabsToReplace(
        selectedTab,
        lastMouseX - e.pageX >= 1 ? 'left' : 'right',
      );

      this.lastMouseX = e.pageX;
    }
  };

  public revertClosed() {
    this.addTab({ active: true, url: this.closedUrl });
  }
}
