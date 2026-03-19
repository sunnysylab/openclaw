import { definePluginEntry } from "openclaw/plugin-sdk/core";
import { createOctenWebSearchProvider } from "./web-search.js";

export default definePluginEntry({
  id: "octen",
  name: "Octen Plugin",
  description: "Bundled Octen plugin",
  register(api) {
    api.registerWebSearchProvider(createOctenWebSearchProvider());
  },
});
