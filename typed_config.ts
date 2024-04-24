import configJson from "./config.json" assert { type: "json" };

type Config = {
	elastic: {
		node?: string,
		username?: string,
		password?: string,
		apiKey?: string,
	},
	kibana: {
		node?: string,
		username?: string,
		password?: string,
		apiKey?: string
	},
	eventIndex?: string
}

const config = configJson as Config;

export default config;
