export const parsePossiblyInvalidURL = (url: string) => {
  try {
    return new URL(url);
  } catch (e) {
    if (url.indexOf(' ') !== -1) return {} as URL;
    else return new URL(`empty://${url}`);
  }
};
