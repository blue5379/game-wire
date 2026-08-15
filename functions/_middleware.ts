const OLD_HOSTNAME = 'game-wire.pages.dev';
const NEW_ORIGIN = 'https://gamequestra.com';

// Cloudflare Pagesの静的アセット配信は拡張子のないパスに308でtrailing slashを付与するため、
// ここで先に付与しておかないと旧ドメインへのリンクが301→308の二段リダイレクトになる。
export function withTrailingSlash(pathname: string): string {
  if (pathname.endsWith('/')) return pathname;
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (lastSegment.includes('.')) return pathname;
  return `${pathname}/`;
}

export const onRequest = async (context: { request: Request; next: () => Promise<Response> }) => {
  const url = new URL(context.request.url);

  if (url.hostname === OLD_HOSTNAME) {
    const pathname = withTrailingSlash(url.pathname);
    return Response.redirect(`${NEW_ORIGIN}${pathname}${url.search}`, 301);
  }

  return context.next();
};
