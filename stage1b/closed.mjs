export default {
  fetch() {
    return new Response('Snap n Dish Stage 1B staging is paused.', {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  },
  async scheduled() {},
};
