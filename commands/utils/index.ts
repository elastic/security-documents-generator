import { Client, ClientOptions } from "@elastic/elasticsearch";
import config from '../../typed_config';

export const getEsClient = () => {
  let client = null;
  if (!config.elastic.node) return client;
  if (
    !config.elastic.apiKey &&
    !(config.elastic.username && config.elastic.password)
  )
    return client;
  let auth;
  if(config.elastic.apiKey) {
    auth = {apiKey : config.elastic.apiKey};
  } else if (config.elastic.username && config.elastic.password){
	  auth = {
    username : config.elastic.username,
    password : config.elastic.password,
	  };
  }
  client = new Client({
    node: config.elastic.node,
    auth,
  });

  return client;
};

export const indexCheck = async (index: string, mappings: object) => {
  let client = getEsClient();
  if (!client) {
    throw new Error;
  }
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
