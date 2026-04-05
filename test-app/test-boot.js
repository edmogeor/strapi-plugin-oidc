const { createStrapi } = require('@strapi/strapi');
async function run() {
  const strapi = createStrapi({ appDir: __dirname, distDir: __dirname + '/dist' });
  await strapi.load();
  await strapi.server.mount();
  console.log("Strapi booted successfully!");
  await strapi.server.httpServer.close();
  await strapi.destroy();
}
run().catch(console.error);
