export class URLPrefix {
  public prefix: string;
  public componentsCount: number;

  // Input prefix must be in lowercase.
  constructor(lowerPrefix: string, componentsCount: number) {
    this.prefix = lowerPrefix;
    this.componentsCount = componentsCount;
  }

  public static getURLPrefixes() {
    return [
      new URLPrefix('http://www.', 2),
      new URLPrefix('https://www.', 2),
      new URLPrefix('ftp://www.', 2),
      new URLPrefix('http://', 1),
      new URLPrefix('https://', 1),
      new URLPrefix('ftp://', 1),
      new URLPrefix('', 0),
    ];
  }

  public static bestURLPrefix(lowerText: string, lowerPrefixSuffix: string) {
    const prefixes = this.getURLPrefixes();
    for (const prefix of prefixes) {
      if (lowerText.startsWith(prefix.prefix + lowerPrefixSuffix))
        return prefix;
    }
    return null;
  }
}
