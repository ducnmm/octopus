import fp from "fastify-plugin";

/**
 * Content-type parsers for Git smart-HTTP (raw buffer) and HTML form posts
 * (raw string, parsed per-route).
 */
export const contentParsersPlugin = fp(
  async (app) => {
    app.addContentTypeParser(/^application\/x-git-.*/, { parseAs: "buffer" }, (_request, body, done) => {
      done(null, body);
    });
    app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
      done(null, body);
    });
  },
  { name: "octopus-content-parsers" }
);

export default contentParsersPlugin;
