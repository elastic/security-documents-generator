import { Client } from "@elastic/elasticsearch";
import config from "../../config.json" assert { type: "json" };

export const getEsClient = () => {
  let client = null;
  if (!config.elastic.node) return client;
  if (
    !config.elastic.apiKey &&
    !(config.elastic.username && config.elastic.password)
  )
    return client;

  client = new Client({
    node: config.elastic.node,
    auth: {
      // apiKey: config.elastic.apiKey,
      username: config.elastic.username,
      password: config.elastic.password,
    },
  });

  return client;
};

export const indexCheck = async (index, mappings) => {
  let client = getEsClient();
  const isExist = await client.indices.exists({ index: index });
  if (isExist) return;

  console.log("Index does not exist, creating...");

  try {
    await client.indices.create({
      index: index,
      body: {
        mappings: mappings,
        settings: {
          "index.mapping.total_fields.limit": 10000,
        },
      },
    });
    console.log("Index created", index);
  } catch (error) {
    console.log("Index creation failed", JSON.stringify(error));
    throw error;
  }
};
