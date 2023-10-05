import { Client } from '@elastic/elasticsearch';
import createAlerts from '../createAlert.mjs';
import alertMappings from '../alertMappings.json'  assert { type: "json" };
import config from '../config.json'  assert { type: "json" };

const client = new Client({
    node: config.elastic.node,
    auth: {
        apiKey: config.elastic.apiKey
      }
})

const ALERT_INDEX = '.my-alerts';


const createDocuments = (n, generated) => {

    return Array(n).fill(null).reduce((acc, val, i) => {
       let count = Math.floor((generated + i)/10)
        const alert = createAlerts(
            {
                host:{
                    name: `Host ${count}`
                },
                user: {
                    name: `User ${count}`
                }
            }
        );
        acc.push({ index: { _index: ALERT_INDEX, _id: alert['kibana.alert.uuid'] } })
        acc.push(alert)
        return acc
    }, [])
};


const alertIndexCheck = async () => {
    const isExist = await client.indices.exists({ index: ALERT_INDEX });
    if (isExist) return;
    
    console.log('Alert index does not exist, creating...')

    try {
        await client.indices.create({
            index: ALERT_INDEX,
            body: {
                mappings: alertMappings.mappings,
                settings: {
                    "index.mapping.total_fields.limit": 2000
                },
            }
        });
        console.log('Alert index created')
    } catch (error) {
        console.log('Alert index creation failed', error)
    } 

}


export const generateFakeAlerts = async (n) => {
    await alertIndexCheck();

    console.log('Generating fake alerts...');

    let limit = 25000;
    let generated = 0;


    while (generated < n) {
        let docs = createDocuments(Math.min(limit, n), generated);
        try {
            const result = await client.bulk({ body: docs, refresh: true });
            generated += result.items.length;
            console.log(`${result.items.length} alerts created, ${n - generated} left`);
        } catch (err) {
            console.log('Error: ', err)
        }
    }

    console.log('Finished gerating alerts')

}

export const generateGraph = async ({
    users = 100,
    maxHosts = 3
}) => {
    await alertIndexCheck();
    console.log('Generating fake alerts graph...');

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

    console.log(alerts)

    
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

