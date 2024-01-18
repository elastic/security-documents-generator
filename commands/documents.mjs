import { Client } from '@elastic/elasticsearch';
import createAlerts from '../createAlerts.mjs';
import createEvents from '../createEvents.mjs';
import alertMappings from '../alertMappings.json'  assert { type: "json" };
import eventMappings from '../eventMappings.json'  assert { type: "json" };
import config from '../config.json'  assert { type: "json" };

let client = null
if(config.elastic.node && config.elastic.apiKey) {
    client = new Client({
        node: config.elastic.node,
        auth: {
            apiKey: config.elastic.apiKey
        }
    })
} 

const ALERT_INDEX = '.alerts-security.alerts-default';
const EVENT_INDEX = config.eventIndex;


const generateDocs = async ({
    createDocs,
    amount,
    index
}) => {
    let limit = 30000;
    let generated = 0;


    while (generated < amount) {
        let docs = createDocuments(Math.min(limit, amount), generated, createDocs, index);
        try {
            const result = await client.bulk({ body: docs, refresh: true });
            generated += result.items.length / 2;
            console.log(`${result.items.length} documents created, ${amount - generated} left`);
        } catch (err) {
            console.log('Error: ', err)
        }
    }

}

const createDocuments = (n, generated, createDoc, index) => {
    return Array(n).fill(null).reduce((acc, val, i) => {
       let count = Math.floor((generated + i)/10)
        let alert = createDoc({
            id_field:"host.name",
            id_value:`Host ${generated + i}`,
            // host: {
            //     name:`Host ${generated + i}`,
            // }
        });
        acc.push({ index: { _index: index } })
        acc.push({...alert})
         alert = createDoc({
            id_field:"user.name",
            id_value:`User ${generated + i}`,
            // user: {
            //     name:`User ${generated + i}`,
            // }
        });
        acc.push({ index: { _index: index } })
        acc.push({...alert})
        return acc
    }, [])
};


const indexCheck = async (index, mappings) => {
    const isExist = await client.indices.exists({ index: index });
    if (isExist) return;
    
    console.log('Index does not exist, creating...')

    try {
        await client.indices.create({
            index: index,
            body: {
                mappings: mappings,
                settings: {
                    "index.mapping.total_fields.limit": 10000
                },
            }
        });
        console.log('Index created', index)
    } catch (error) {
        console.log('Index creation failed', JSON.stringify(error))
        throw error;
    } 

}


export const generateAlerts = async (n) => {
    await indexCheck(ALERT_INDEX, alertMappings);

    console.log('Generating alerts...');

    await generateDocs({
        createDocs: createAlerts,
        amount: n,
        index: ALERT_INDEX
    })

    console.log('Finished gerating alerts')

}


export const generateEvents = async (n) => {

    await indexCheck(EVENT_INDEX, eventMappings);

    console.log('Generating events...');

       await generateDocs({
        createDocs: createEvents,
        amount: n,
        index: EVENT_INDEX
    })

    console.log('Finished gerating events')

}

export const generateGraph = async ({
    users = 100,
    maxHosts = 3
}) => {
    await alertIndexCheck();
    console.log('Generating alerts graph...');

    const clusters = []
    let alerts = [];
    for(let i = 0; i < users; i++) {
        let userCluster = [];
        for (let j = 0; j < maxHosts; j++) {
            const alert = createAlerts({
                host: {
                    name: `Host ${i}${j}`
                },
                user: {
                    name: `User ${i}`
                }
            });
            userCluster.push(alert)
            // alerts.push({ index: { _index: ALERT_INDEX, _id: alert['kibana.alert.uuid'] } })
            // alerts.push(alert)
        }
        clusters.push(userCluster)
    }

    let lastAlertFromCluster = null;
    clusters.forEach((cluster) => {
        if(lastAlertFromCluster) {
            const alert = createAlerts({
                host: {
                    name: cluster[0].host.name
                },
                user: {
                    name: lastAlertFromCluster.user.name
                }
            })
            alerts.push({ index: { _index: ALERT_INDEX, _id: alert['kibana.alert.uuid'] } })
            alerts.push(alert)
        }
        cluster.forEach(alert => {
            alerts.push({ index: { _index: ALERT_INDEX, _id: alert['kibana.alert.uuid'] } })
            alerts.push(alert)
            lastAlertFromCluster = alert;
        })

    });
    
    try {
        const result = await client.bulk({ body: alerts, refresh: true });
        console.log(`${result.items.length} alerts created`);
    } catch (err) {
        console.log('Error: ', err)
    }
}

export const deleteAllAlerts = async () => {
    console.log('Deleting all alerts...');
    try {
        console.log('Deleted all alerts')
        await client.deleteByQuery({
            index: ALERT_INDEX,
            refresh: true,
            body: {
                query: {
                    match_all: {}
                }
            }
        });
    } catch (error) {
        console.log('Failed to delete alerts')
        console.log(error)
    }
}

export const deleteAllEvents = async () => {
    console.log('Deleting all events...');
    try {
        console.log('Deleted all events')
        await client.deleteByQuery({
            index: EVENT_INDEX,
            refresh: true,
            body: {
                query: {
                    match_all: {}
                }
            }
        });
    } catch (error) {
        console.log('Failed to delete events')
        console.log(error)
    }
}



