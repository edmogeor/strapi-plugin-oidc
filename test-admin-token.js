async function run() {
  const strapi = (global).strapiInstance;
  if (!strapi) return;
  const adminService = strapi.service('admin::user');
  console.log('Admin service exists?', !!adminService);
}
// Cannot run standalone if not in setup.ts context.
