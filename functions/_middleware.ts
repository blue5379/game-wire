const OLD_HOSTNAME = 'game-wire.pages.dev';
const NEW_ORIGIN = 'https://gamequestra.com';

export const onRequest = async (context: { request: Request; next: () => Promise<Response> }) => {
  const url = new URL(context.request.url);

  if (url.hostname === OLD_HOSTNAME) {
    return Response.redirect(`${NEW_ORIGIN}${url.pathname}${url.search}`, 301);
  }

  return context.next();
};
