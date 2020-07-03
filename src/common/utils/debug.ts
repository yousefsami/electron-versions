export const DCHECK = (a: any) => {
  if (!a) {
    if (process.env.NODE_ENV === 'development') throw new Error();
    console.error();
  }
};
