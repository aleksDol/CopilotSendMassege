import { buildApp } from "./app.js";
import { createConfig } from "./config/index.js";
import { env } from "./config/env.js";

const start = async () => {
  const config = createConfig(env);
  const app = await buildApp(config);

  try {
    await app.listen({ host: "0.0.0.0", port: config.env.PORT });
    app.log.info(`API running on 0.0.0.0:${config.env.PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
